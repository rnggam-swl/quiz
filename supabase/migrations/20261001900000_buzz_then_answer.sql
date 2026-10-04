-- P8-01 · Rebutan varian "Pencet lalu Jawab" (docs/10-mode-battle.md#varian-b-pencet-lalu-jawab).
--
-- policy.buzzer.variant = 'buzz_then_answer': the first BUZZ the database accepts holds the
-- round for policy.buzzer.holdS seconds; only the holder may answer. Right: they win the
-- round as usual. Wrong, or the hold runs out: they're out for this question (a
-- battle_answers row, penalty as usual) and the buzzer opens again for everyone else.

create table public.buzzer_holds (
  round_id       uuid primary key references public.battle_rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  expires_at     timestamptz not null,
  created_at     timestamptz not null default now()
);

alter table public.buzzer_holds enable row level security;
create policy "buzzer holds: host reads" on public.buzzer_holds
  for select to authenticated
  using (exists (
    select 1 from public.battle_rounds r where r.id = round_id and public.owns_session(r.session_id)
  ));
revoke all on public.buzzer_holds from anon, authenticated;
grant select on public.buzzer_holds to authenticated;
grant select, insert, update, delete on public.buzzer_holds to service_role;

-- A hold that ran out counts as a wrong answer: the holder is out for this question.
create function public.expire_buzzer_hold(
  p_session public.sessions,
  p_round   public.battle_rounds,
  p_hold    public.buzzer_holds
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_penalty int := greatest(0, coalesce((p_session.policy -> 'buzzer' ->> 'wrongPenalty')::int, 0));
  v_points  int := 0;
begin
  delete from public.buzzer_holds where round_id = p_round.id;
  insert into public.battle_answers (round_id, participant_id, answer, correct, reaction_ms)
  values (p_round.id, p_hold.participant_id, '{"timeout": true}', false,
          greatest(0, (extract(epoch from (p_hold.expires_at - p_round.opened_at)) * 1000)::int))
  on conflict (round_id, participant_id) do nothing;
  if found and v_penalty > 0 then
    select -least(v_penalty, score) into v_points from public.participants where id = p_hold.participant_id;
    update public.battle_answers set points = v_points
     where round_id = p_round.id and participant_id = p_hold.participant_id;
  end if;
  update public.participants set score = score + v_points, streak = 0
   where id = p_hold.participant_id;
  update public.sessions set state_version = state_version + 1 where id = p_session.id;
end;
$$;

-- BUZZ: take the round if nobody holds it (a hold that ran out is expired first).
create function public.buzz_in(p_participant_id uuid, p_question_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_participant public.participants;
  v             public.sessions;
  v_round       public.battle_rounds;
  v_hold        public.buzzer_holds;
  v_holder      jsonb;
  v_hold_s      int;
begin
  select * into v_participant from public.participants where id = p_participant_id;
  if not found then
    raise exception 'participant_not_found' using errcode = 'P0002';
  end if;
  if v_participant.kicked_at is not null then
    raise exception 'kicked' using errcode = 'P0001';
  end if;
  if v_participant.is_spectator then
    raise exception 'spectator' using errcode = 'P0001';
  end if;
  select * into v from public.sessions where id = v_participant.session_id;
  if v.mode is distinct from 'battle_buzzer'
     or coalesce(v.policy -> 'buzzer' ->> 'variant', 'first_correct') <> 'buzz_then_answer' then
    raise exception 'wrong_mode' using errcode = 'P0001';
  end if;

  select * into v_round from public.battle_rounds
   where session_id = v.id and idx = v.current_round
     for update;
  select * into v from public.sessions where id = v.id;
  if not found or v.phase is distinct from 'open' or v_round.status <> 'open'
     or v_round.question_id <> p_question_id then
    return jsonb_build_object('accepted', false, 'reason', 'round_closed');
  end if;
  if v_round.closes_at is not null and now() > v_round.closes_at then
    return jsonb_build_object('accepted', false, 'reason', 'deadline_passed');
  end if;
  if exists (select 1 from public.battle_answers
              where round_id = v_round.id and participant_id = p_participant_id) then
    return jsonb_build_object('accepted', false, 'reason', 'already_answered');
  end if;

  select * into v_hold from public.buzzer_holds where round_id = v_round.id;
  if found then
    if v_hold.expires_at > now() then
      select jsonb_build_object('id', p.id, 'nickname', p.nickname) into v_holder
        from public.participants p where p.id = v_hold.participant_id;
      return jsonb_build_object('accepted', false, 'reason', 'held', 'holder', v_holder,
                                'expiresAt', v_hold.expires_at);
    end if;
    perform public.expire_buzzer_hold(v, v_round, v_hold);
  end if;

  v_hold_s := least(30, greatest(1, coalesce((v.policy -> 'buzzer' ->> 'holdS')::int, 5)));
  insert into public.buzzer_holds (round_id, participant_id, expires_at)
  values (v_round.id, p_participant_id, now() + make_interval(secs => v_hold_s))
  returning * into v_hold;
  update public.participants set last_seen_at = now() where id = p_participant_id;
  -- Every screen shows who is answering.
  update public.sessions set state_version = state_version + 1 where id = v.id;
  return jsonb_build_object('accepted', true, 'expiresAt', v_hold.expires_at);
end;
$$;

-- record_battle_answer for both variants: buzz_then_answer checks (and releases) the hold,
-- first_correct keeps the grace window of P8-04.
create or replace function public.record_battle_answer(
  p_participant_id uuid,
  p_question_id    uuid,
  p_answer         jsonb,
  p_correct        boolean,
  p_points         int,
  p_penalty        int default 0,
  p_client_ms      int default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_participant public.participants;
  v             public.sessions;
  v_round       public.battle_rounds;
  v_hold        public.buzzer_holds;
  v_winner      jsonb;
  v_buzz        boolean;
  v_server      int;
  v_reaction    int;
  v_grace       int;
  v_points      int := 0;
  v_won         boolean := false;
begin
  select * into v_participant from public.participants where id = p_participant_id;
  if not found then
    raise exception 'participant_not_found' using errcode = 'P0002';
  end if;
  if v_participant.kicked_at is not null then
    raise exception 'kicked' using errcode = 'P0001';
  end if;
  if v_participant.is_spectator then
    raise exception 'spectator' using errcode = 'P0001';
  end if;

  select * into v from public.sessions where id = v_participant.session_id;
  if v.mode is distinct from 'battle_buzzer' then
    raise exception 'wrong_mode' using errcode = 'P0001';
  end if;
  -- Serialise the answers to this round.
  select * into v_round from public.battle_rounds
   where session_id = v.id and idx = v.current_round
     for update;
  -- Re-read the session after waiting for the lock: a winner may have moved it on.
  select * into v from public.sessions where id = v.id;
  if not found or v.phase is distinct from 'open' or v_round.question_id <> p_question_id
     or not (v_round.status = 'open'
             or (v_round.status = 'resolving' and now() < v_round.resolve_at)) then
    select jsonb_build_object('id', p.id, 'nickname', p.nickname) into v_winner
      from public.round_winners w join public.participants p on p.id = w.participant_id
     where w.round_id = v_round.id;
    return jsonb_build_object('accepted', false, 'reason', 'round_closed', 'winner', v_winner);
  end if;

  v_buzz := coalesce(v.policy -> 'buzzer' ->> 'variant', 'first_correct') = 'buzz_then_answer';
  if v_buzz then
    -- Only the one holding the buzzer answers, within the hold (+1 s for the network).
    select * into v_hold from public.buzzer_holds where round_id = v_round.id;
    if not found or v_hold.participant_id <> p_participant_id then
      return jsonb_build_object('accepted', false, 'reason', 'not_holding');
    end if;
    if now() > v_hold.expires_at + interval '1 second' then
      perform public.expire_buzzer_hold(v, v_round, v_hold);
      return jsonb_build_object('accepted', false, 'reason', 'hold_expired');
    end if;
    delete from public.buzzer_holds where round_id = v_round.id;
  elsif v_round.closes_at is not null and now() > v_round.closes_at + interval '1 second' then
    return jsonb_build_object('accepted', false, 'reason', 'deadline_passed');
  end if;

  v_server := greatest(0, least(v_round.time_limit_ms,
    (extract(epoch from (coalesce(v.paused_at, now()) - v_round.opened_at)) * 1000)::int));
  v_reaction := case when p_client_ms is null then v_server
                     else least(v_server, greatest(p_client_ms, v_server - 300, 100)) end;
  insert into public.battle_answers (round_id, participant_id, answer, correct, reaction_ms, client_ms)
  values (v_round.id, p_participant_id, p_answer, p_correct, v_reaction, p_client_ms)
  on conflict (round_id, participant_id) do nothing;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'already_answered');
  end if;

  v_grace := least(2000, greatest(0, coalesce((v.policy -> 'buzzer' ->> 'graceMs')::int, 250)));
  if p_correct and v_grace > 0 and not v_buzz then
    -- A candidate: the window opens with the first one, resolve_buzzer_round picks.
    if v_round.status = 'open' then
      update public.battle_rounds
         set status = 'resolving', resolve_at = now() + make_interval(secs => v_grace / 1000.0),
             win_points = greatest(0, p_points)
       where id = v_round.id
      returning * into v_round;
    end if;
    update public.participants set last_seen_at = now() where id = p_participant_id;
    return jsonb_build_object(
      'accepted', true, 'pending', true, 'correct', true, 'points', 0, 'reactionMs', v_reaction,
      'roundId', v_round.id,
      'resolveInMs', greatest(0, ceil(extract(epoch from (v_round.resolve_at - now())) * 1000))::int
    );
  end if;

  if p_correct then
    insert into public.round_winners (round_id, participant_id)
    values (v_round.id, p_participant_id)
    on conflict (round_id) do nothing;
    v_won := found;
  end if;

  if v_won then
    v_points := greatest(0, p_points);
    perform public.buzzer_win(v, v_round, p_participant_id, v_points);
  else
    if not p_correct and p_penalty > 0 then
      -- The penalty never takes a score below zero.
      v_points := -least(greatest(0, p_penalty), v_participant.score);
      update public.battle_answers set points = v_points
       where round_id = v_round.id and participant_id = p_participant_id;
    end if;
    update public.participants set score = score + v_points, streak = 0, last_seen_at = now()
     where id = p_participant_id;
    -- Buzz variant: the buzzer is free again, every screen should know.
    if v_buzz then
      update public.sessions set state_version = state_version + 1 where id = v.id;
    end if;
  end if;

  return jsonb_build_object('accepted', true, 'won', v_won, 'correct', p_correct,
                            'points', v_points, 'reactionMs', v_reaction, 'roundId', v_round.id);
end;
$$;

-- live_state plus who holds the buzzer (buzz variant). Same callers and rights as
-- live_state: the host through RLS, the service role for the phones.
create function public.live_game_state(p_session_id uuid, p_participant_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_state jsonb := public.live_state(p_session_id, p_participant_id);
  v_hold  jsonb;
begin
  if v_state is null or v_state ->> 'mode' <> 'battle_buzzer' or v_state ->> 'roundId' is null then
    return v_state;
  end if;
  select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'expiresAt', h.expires_at)
    into v_hold
    from public.buzzer_holds h join public.participants p on p.id = h.participant_id
   where h.round_id = (v_state ->> 'roundId')::uuid;
  return v_state || jsonb_build_object('hold', v_hold);
end;
$$;

revoke all on function public.expire_buzzer_hold(public.sessions, public.battle_rounds, public.buzzer_holds)
  from public, anon, authenticated;
revoke all on function public.buzz_in(uuid, uuid) from public, anon, authenticated;
revoke all on function public.live_game_state(uuid, uuid) from public, anon;
grant execute on function public.expire_buzzer_hold(public.sessions, public.battle_rounds, public.buzzer_holds)
  to service_role;
grant execute on function public.buzz_in(uuid, uuid) to service_role;
grant execute on function public.live_game_state(uuid, uuid) to authenticated, service_role;
