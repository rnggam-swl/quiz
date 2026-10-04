-- P8-04 · Rebutan: jeda toleransi (docs/10-mode-battle.md#keadilan-latensi).
--
-- The first right answer no longer wins on arrival. It opens a short window
-- (policy.buzzer.graceMs, default 250 ms; 0 = the old rule) in which other right answers
-- still count; then the smallest reaction time wins. The reaction time is the phone's own
-- measurement from showing the question to the tap (buka serentak, P8-03, makes that a
-- fair start), trusted only within bounds: never more than 300 ms faster than the server
-- saw it arrive, never under 100 ms, never slower than arrival. So a slow uplink costs at
-- most nothing up to 300 ms, and a lying phone gains at most 300 ms.

alter table public.battle_rounds
  add column resolve_at timestamptz,  -- end of the grace window (status 'resolving')
  add column win_points int;          -- what the winner of the window gets

alter table public.battle_answers
  add column client_ms int;           -- as reported by the phone, kept for audits

-- The win itself, shared by the immediate rule and the grace window: points, streaks, the
-- round revealed and the session on to the reveal.
create function public.buzzer_win(
  p_session     public.sessions,
  p_round       public.battle_rounds,
  p_participant uuid,
  p_points      int
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.participants
     set score = score + greatest(0, p_points), streak = streak + 1, last_seen_at = now()
   where id = p_participant;
  update public.battle_answers set points = greatest(0, p_points)
   where round_id = p_round.id and participant_id = p_participant;
  -- A win in a row counts; anyone else's run ends here.
  update public.participants set streak = 0
   where session_id = p_session.id and id <> p_participant and streak > 0;
  update public.battle_rounds set status = 'revealed', locked_at = now() where id = p_round.id;
  update public.sessions
     set phase = 'reveal', phase_opened_at = now(), phase_closes_at = now() + interval '5 seconds',
         paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
   where id = p_session.id;
end;
$$;

drop function public.record_battle_answer(uuid, uuid, jsonb, boolean, int, int);

create function public.record_battle_answer(
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
  v_winner      jsonb;
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
  if v_round.closes_at is not null and now() > v_round.closes_at + interval '1 second' then
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
  if p_correct and v_grace > 0 then
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
  elsif not p_correct and p_penalty > 0 then
    -- The penalty never takes a score below zero.
    v_points := -least(greatest(0, p_penalty), v_participant.score);
    update public.participants set score = score + v_points, streak = 0, last_seen_at = now()
     where id = p_participant_id;
    update public.battle_answers set points = v_points
     where round_id = v_round.id and participant_id = p_participant_id;
  else
    update public.participants set streak = 0, last_seen_at = now() where id = p_participant_id;
  end if;

  return jsonb_build_object('accepted', true, 'won', v_won, 'correct', p_correct,
                            'points', v_points, 'reactionMs', v_reaction, 'roundId', v_round.id);
end;
$$;

-- Close a grace window that has run out: the right answer with the smallest reaction time
-- wins (ties: who arrived first). Called by the answer that opened the window once it's
-- over, and by the host before moving on. 'pending' tells the caller how long to wait.
create function public.resolve_buzzer_round(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v        public.sessions;
  v_round  public.battle_rounds;
  v_winner uuid;
begin
  select s.* into v
    from public.sessions s
    join public.quizzes q on q.id = s.quiz_id
   where s.id = p_session_id and s.mode = 'battle_buzzer'
     and ((select auth.uid()) is null or q.owner_id = (select auth.uid()))
     for update of s;
  if not found then
    return jsonb_build_object('status', 'none');
  end if;
  select * into v_round from public.battle_rounds
   where session_id = v.id and idx = v.current_round
     for update;
  if not found or v_round.status <> 'resolving' then
    return jsonb_build_object('status', 'none');
  end if;
  if now() < v_round.resolve_at then
    return jsonb_build_object('status', 'pending', 'waitMs',
      ceil(extract(epoch from (v_round.resolve_at - now())) * 1000)::int);
  end if;

  select b.participant_id into v_winner
    from public.battle_answers b
   where b.round_id = v_round.id and b.correct
   order by b.reaction_ms, b.received_at, b.id
   limit 1;
  insert into public.round_winners (round_id, participant_id) values (v_round.id, v_winner)
  on conflict (round_id) do nothing;
  perform public.buzzer_win(v, v_round, v_winner, coalesce(v_round.win_points, 0));
  return jsonb_build_object('status', 'resolved', 'winnerId', v_winner);
end;
$$;

revoke all on function public.buzzer_win(public.sessions, public.battle_rounds, uuid, int)
  from public, anon, authenticated;
revoke all on function public.record_battle_answer(uuid, uuid, jsonb, boolean, int, int, int)
  from public, anon, authenticated;
revoke all on function public.resolve_buzzer_round(uuid) from public, anon;
grant execute on function public.buzzer_win(public.sessions, public.battle_rounds, uuid, int)
  to service_role;
grant execute on function public.record_battle_answer(uuid, uuid, jsonb, boolean, int, int, int)
  to service_role;
grant execute on function public.resolve_buzzer_round(uuid) to authenticated, service_role;
