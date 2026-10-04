-- P8-02 · Mode tim (docs/10-mode-battle.md#mode-tim).
--
-- policy.teams = { enabled, count (2–5), assign: 'auto' | 'choose' }. Teams are made with the
-- session and take the answer slots' colour + shape (Merah ▲, Biru ◆, Kuning ●, Hijau ■,
-- Ungu ★). Auto: each newcomer joins the smallest team. Choose: participants pick in the
-- lobby; whoever hasn't picked when the host starts is placed like auto.
-- Team score: live = the members' average (fair for uneven teams), rebutan = the sum (one
-- member answers per question for the team), royale = members still in, then their lives.

create table public.teams (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  slot       int not null check (slot between 1 and 5),
  name       text not null check (char_length(name) between 1 and 30),
  unique (session_id, slot)
);

alter table public.participants
  add column team_id uuid references public.teams (id) on delete set null;
create index participants_team_idx on public.participants (team_id) where team_id is not null;

alter table public.teams enable row level security;
create policy "teams: host reads" on public.teams
  for select to authenticated using (public.owns_session(session_id));
revoke all on public.teams from anon, authenticated;
grant select on public.teams to authenticated;
grant select, insert, update, delete on public.teams to service_role;

-- ─── Making and filling teams ─────────────────────────────────────────────────

create function public.create_session_teams()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((new.policy -> 'teams' ->> 'enabled')::boolean, false) then
    insert into public.teams (session_id, slot, name)
    select new.id, g, (array['Tim Merah', 'Tim Biru', 'Tim Kuning', 'Tim Hijau', 'Tim Ungu'])[g]
      from generate_series(1, least(5, greatest(2, coalesce((new.policy -> 'teams' ->> 'count')::int, 2)))) g
    on conflict (session_id, slot) do nothing;
  end if;
  return new;
end;
$$;

create trigger sessions_create_teams
  after insert on public.sessions
  for each row execute function public.create_session_teams();

-- Put participants without a team into the smallest team (ties: the lowest slot).
-- p_force = false only acts in 'auto' sessions (on join); true places everyone (at the start).
create function public.assign_teams(p_session_id uuid, p_force boolean default false)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.sessions;
  v_p     record;
  v_team  uuid;
  v_count int := 0;
begin
  select s.* into v
    from public.sessions s join public.quizzes q on q.id = s.quiz_id
   where s.id = p_session_id
     and ((select auth.uid()) is null or q.owner_id = (select auth.uid()))
     for update of s;
  if not found or not exists (select 1 from public.teams t where t.session_id = v.id) then
    return 0;
  end if;
  if not p_force and coalesce(v.policy -> 'teams' ->> 'assign', 'auto') <> 'auto' then
    return 0;
  end if;
  for v_p in
    select p.id from public.participants p
     where p.session_id = v.id and p.team_id is null and p.kicked_at is null
     order by p.joined_at, p.id
  loop
    select t.id into v_team
      from public.teams t
      left join public.participants m on m.team_id = t.id and m.kicked_at is null
     where t.session_id = v.id
     group by t.id, t.slot
     order by count(m.id), t.slot
     limit 1;
    update public.participants set team_id = v_team where id = v_p.id;
    v_count := v_count + 1;
  end loop;
  if v_count > 0 then
    update public.sessions set state_version = state_version + 1 where id = v.id;
  end if;
  return v_count;
end;
$$;

-- Host, in the lobby: deal everyone out again, evenly and at random.
create function public.shuffle_teams(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sessions;
begin
  select s.* into v
    from public.sessions s join public.quizzes q on q.id = s.quiz_id
   where s.id = p_session_id and q.owner_id = (select auth.uid())
     for update of s;
  if not found or v.phase is distinct from 'lobby' then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  with slots as (
    select t.id, row_number() over (order by t.slot) - 1 as k, count(*) over () as n
      from public.teams t where t.session_id = v.id
  ),
  dealt as (
    select p.id, (row_number() over (order by random()) - 1) as i
      from public.participants p
     where p.session_id = v.id and p.kicked_at is null
  )
  update public.participants p
     set team_id = t.id
    from dealt d, slots t
   where p.id = d.id and t.k = d.i % t.n;
  update public.sessions set state_version = state_version + 1 where id = v.id;
end;
$$;

-- Participant, in the lobby of a 'choose' session: pick a team.
create function public.choose_team(p_participant_id uuid, p_team_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_participant public.participants;
  v             public.sessions;
begin
  select * into v_participant from public.participants where id = p_participant_id;
  if not found or v_participant.kicked_at is not null then
    raise exception 'participant_not_found' using errcode = 'P0002';
  end if;
  select * into v from public.sessions where id = v_participant.session_id;
  if v.phase is distinct from 'lobby' or coalesce(v.policy -> 'teams' ->> 'assign', 'auto') <> 'choose' then
    raise exception 'round_closed' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teams t where t.id = p_team_id and t.session_id = v.id) then
    raise exception 'team_not_found' using errcode = 'P0002';
  end if;
  update public.participants set team_id = p_team_id where id = p_participant_id;
  update public.sessions set state_version = state_version + 1 where id = v.id;
end;
$$;

-- Rebutan with teams: someone else of the same team already answered (or buzzed and lost)
-- this round, so this member may not.
create function public.team_already_played(p_round_id uuid, p_participant public.participants)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select p_participant.team_id is not null and exists (
    select 1
      from public.battle_answers b
      join public.participants o on o.id = b.participant_id
     where b.round_id = p_round_id and o.team_id = p_participant.team_id
       and o.id <> p_participant.id
  )
$$;

-- ─── Rebutan: one representative per team ─────────────────────────────────────

create or replace function public.buzz_in(p_participant_id uuid, p_question_id uuid)
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
  if public.team_already_played(v_round.id, v_participant) then
    return jsonb_build_object('accepted', false, 'reason', 'team_answered');
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
    -- The expired holder may have been a teammate: their chance was the team's.
    if public.team_already_played(v_round.id, v_participant) then
      return jsonb_build_object('accepted', false, 'reason', 'team_answered');
    end if;
  end if;

  v_hold_s := least(30, greatest(1, coalesce((v.policy -> 'buzzer' ->> 'holdS')::int, 5)));
  insert into public.buzzer_holds (round_id, participant_id, expires_at)
  values (v_round.id, p_participant_id, now() + make_interval(secs => v_hold_s))
  returning * into v_hold;
  update public.participants set last_seen_at = now() where id = p_participant_id;
  update public.sessions set state_version = state_version + 1 where id = v.id;
  return jsonb_build_object('accepted', true, 'expiresAt', v_hold.expires_at);
end;
$$;

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
  -- Teams: one member answers per question for the whole team.
  if public.team_already_played(v_round.id, v_participant) then
    return jsonb_build_object('accepted', false, 'reason', 'team_answered');
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
    if v_buzz or v_participant.team_id is not null then
      -- The buzzer is free again, or a team is out: every screen should know.
      update public.sessions set state_version = state_version + 1 where id = v.id;
    end if;
  end if;

  return jsonb_build_object('accepted', true, 'won', v_won, 'correct', p_correct,
                            'points', v_points, 'reactionMs', v_reaction, 'roundId', v_round.id);
end;
$$;

-- ─── State ────────────────────────────────────────────────────────────────────

create or replace function public.live_game_state(p_session_id uuid, p_participant_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_state  jsonb := public.live_state(p_session_id, p_participant_id);
  v_mode   text;
  v_hold   jsonb;
  v_teams  jsonb;
  v_team   jsonb;
  v_played int;
begin
  if v_state is null then
    return null;
  end if;
  v_mode := v_state ->> 'mode';

  if v_mode = 'battle_buzzer' and v_state ->> 'roundId' is not null then
    select jsonb_build_object('id', p.id, 'nickname', p.nickname, 'expiresAt', h.expires_at)
      into v_hold
      from public.buzzer_holds h join public.participants p on p.id = h.participant_id
     where h.round_id = (v_state ->> 'roundId')::uuid;
    v_state := v_state || jsonb_build_object('hold', v_hold);
  end if;

  if exists (select 1 from public.teams t where t.session_id = p_session_id) then
    with members as (
      select p.id, p.team_id, p.score, p.lives, p.eliminated_round
        from public.participants p
       where p.session_id = p_session_id and p.kicked_at is null and p.team_id is not null
         and (not p.is_spectator or p.eliminated_round is not null)
    ),
    agg as (
      select t.id, t.slot, t.name,
             count(m.team_id)::int as members,
             count(m.team_id) filter (where m.eliminated_round is null)::int as alive,
             case v_mode
               when 'live' then coalesce(round(avg(m.score)), 0)
               when 'battle_royale' then coalesce(sum(greatest(coalesce(m.lives, 0), 0))
                                                    filter (where m.eliminated_round is null), 0)
               else coalesce(sum(m.score), 0)
             end::int as score,
             -- Who is in which team: phones find their own after a shuffle (the lobby shows it).
             coalesce(jsonb_agg(m.id order by m.id) filter (where m.id is not null), '[]'::jsonb)
               as member_ids
        from public.teams t
        left join members m on m.team_id = t.id
       where t.session_id = p_session_id
       group by t.id, t.slot, t.name
    )
    select jsonb_agg(jsonb_build_object(
             'id', id, 'slot', slot, 'name', name, 'members', members, 'alive', alive,
             'score', score, 'rank', rank, 'memberIds', member_ids) order by rank, slot)
      into v_teams
      from (
        select a.*, (rank() over (
                  order by case when v_mode = 'battle_royale' then a.alive end desc nulls last,
                           a.score desc))::int as rank
          from agg a
      ) ranked;
    v_state := v_state || jsonb_build_object('teams', v_teams);

    if v_mode = 'battle_buzzer' and v_state ->> 'roundId' is not null then
      select count(distinct p.team_id)::int into v_played
        from public.battle_answers b join public.participants p on p.id = b.participant_id
       where b.round_id = (v_state ->> 'roundId')::uuid and p.team_id is not null;
      v_state := v_state || jsonb_build_object('teamsAnswered', v_played);
    end if;

    if p_participant_id is not null and v_state -> 'you' is not null
       and jsonb_typeof(v_state -> 'you') = 'object' then
      select jsonb_build_object('id', t.id, 'slot', t.slot, 'name', t.name) into v_team
        from public.participants p join public.teams t on t.id = p.team_id
       where p.id = p_participant_id;
      v_state := jsonb_set(v_state, '{you,team}', coalesce(v_team, 'null'::jsonb));
    end if;
  end if;
  return v_state;
end;
$$;

revoke all on function public.create_session_teams() from public, anon, authenticated;
revoke all on function public.assign_teams(uuid, boolean) from public, anon;
revoke all on function public.shuffle_teams(uuid) from public, anon;
revoke all on function public.choose_team(uuid, uuid) from public, anon, authenticated;
revoke all on function public.team_already_played(uuid, public.participants) from public, anon, authenticated;
grant execute on function public.assign_teams(uuid, boolean) to authenticated, service_role;
grant execute on function public.shuffle_teams(uuid) to authenticated;
grant execute on function public.choose_team(uuid, uuid) to service_role;
grant execute on function public.team_already_played(uuid, public.participants) to service_role;
