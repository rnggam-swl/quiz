-- P5 · Live sessions (docs/09-mode-live.md): the host runs the quiz from the projector,
-- participants answer on their phones, points depend on accuracy and speed.
-- Rounds live in battle_rounds so battle modes (P6–P7) reuse the same table.
-- Participants reach everything through service_role RPCs called by Server Actions;
-- the host moves the phases with owner-checked RPCs. Every change the participants
-- must see bumps sessions.state_version: clients refetch when it moves.

create type public.live_phase as enum
  ('lobby', 'countdown', 'open', 'reveal', 'leaderboard', 'podium', 'ended');
create type public.round_status as enum
  ('pending', 'countdown', 'open', 'resolving', 'locked', 'revealed');

alter table public.sessions
  add column phase               public.live_phase,
  add column current_round       int check (current_round >= 0),
  add column phase_opened_at     timestamptz,
  add column phase_closes_at     timestamptz,
  add column paused_at           timestamptz,
  add column paused_remaining_ms int check (paused_remaining_ms >= 0),
  add column state_version       int not null default 0,
  add column lobby_locked        boolean not null default false,
  add column auto_advance        boolean not null default false,
  -- One seed and one question order for everyone: the projector and the phones match.
  add column seed                bigint,
  add column question_ids        uuid[];

alter table public.participants
  add column score        int not null default 0,
  add column streak       int not null default 0,
  add column is_spectator boolean not null default false,
  add column kicked_at    timestamptz;

create index participants_session_score_idx on public.participants (session_id, score desc);

-- ─── Rounds ───────────────────────────────────────────────────────────────────

create table public.battle_rounds (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references public.sessions (id) on delete cascade,
  idx           int  not null check (idx >= 0),
  question_id   uuid not null,
  status        public.round_status not null default 'countdown',
  time_limit_ms int  not null check (time_limit_ms > 0),
  opened_at     timestamptz,
  closes_at     timestamptz,
  locked_at     timestamptz,
  unique (session_id, idx)
);

alter table public.battle_rounds enable row level security;

create policy "rounds: host reads" on public.battle_rounds
  for select to authenticated using (public.owns_session(session_id));

revoke all on public.battle_rounds from anon;
grant select on public.battle_rounds to authenticated;
grant select, insert, update, delete on public.battle_rounds to service_role;

-- ─── Helpers ──────────────────────────────────────────────────────────────────

-- Time limit of a question in ms: its own, else the session's per-question timer, else 20 s.
create function public.live_time_limit_ms(p_session public.sessions, p_question_id uuid)
returns int
language sql
stable
security invoker
set search_path = ''
as $$
  select greatest(5, least(600, coalesce(
           (select (q ->> 'time_limit_s')::int
              from public.quiz_versions v, jsonb_array_elements(v.snapshot -> 'questions') q
             where v.id = p_session.quiz_version_id and q ->> 'id' = p_question_id::text),
           (p_session.policy -> 'timer' ->> 'perQuestionS')::int,
           20))) * 1000;
$$;

-- Close the game: every attempt is handed in with the points it earned.
create function public.live_finish(p_session_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.attempts a
     set status = 'submitted',
         submitted_at = now(),
         score = coalesce((select sum(points) from public.responses r where r.attempt_id = a.id), 0)
   where a.session_id = p_session_id and a.status = 'in_progress';
$$;

-- ─── Host: phases ─────────────────────────────────────────────────────────────

-- Move a live session along (docs/09 · State machine). p_version must match
-- state_version, so a double press or a second host tab can't skip a phase.
--   next   : the host pressed "Lanjut" (always allowed)
--   auto   : a timer ran out on the host screen (only once now() ≥ phase_closes_at)
--   pause / resume : freeze and continue the phase timer
--   end    : straight to the podium (or ended from the lobby/podium)
create function public.advance_live(p_session_id uuid, p_version int, p_action text)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v         public.sessions;
  v_round   public.battle_rounds;
  v_count   int;
  v_next    int;
  v_limit   int;
begin
  select s.* into v
    from public.sessions s join public.quizzes q on q.id = s.quiz_id
   where s.id = p_session_id and s.mode = 'live' and q.owner_id = (select auth.uid())
     for update of s;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  if p_action not in ('next', 'auto', 'pause', 'resume', 'end') then
    raise exception 'invalid_action' using errcode = '22023';
  end if;
  -- Someone already moved on: nothing to do, the caller gets the current state.
  if p_version is distinct from v.state_version or v.phase = 'ended' then
    return v;
  end if;
  v_count := coalesce(array_length(v.question_ids, 1), 0);
  if v.current_round is not null then
    select * into v_round from public.battle_rounds
     where session_id = v.id and idx = v.current_round;
  end if;

  if p_action = 'pause' then
    if v.paused_at is not null or v.phase in ('lobby', 'podium') then
      return v;
    end if;
    update public.battle_rounds set closes_at = null where id = v_round.id and status = 'open';
    update public.sessions
       set paused_at = now(),
           paused_remaining_ms = case when phase_closes_at is null then null
             else greatest(0, (extract(epoch from phase_closes_at - now()) * 1000)::int) end,
           phase_closes_at = null,
           state_version = state_version + 1
     where id = v.id
    returning * into v;
    return v;
  end if;

  if p_action = 'resume' then
    if v.paused_at is null then
      return v;
    end if;
    -- Time spent paused doesn't count against anyone's speed points.
    update public.battle_rounds
       set opened_at = opened_at + (now() - v.paused_at),
           closes_at = case when v.paused_remaining_ms is null then null
             else now() + make_interval(secs => v.paused_remaining_ms / 1000.0) end
     where id = v_round.id and status = 'open';
    update public.sessions
       set phase_closes_at = case when paused_remaining_ms is null then null
             else now() + make_interval(secs => paused_remaining_ms / 1000.0) end,
           paused_at = null,
           paused_remaining_ms = null,
           state_version = state_version + 1
     where id = v.id
    returning * into v;
    return v;
  end if;

  if p_action = 'auto' and (v.paused_at is not null or v.phase_closes_at is null
                            or now() < v.phase_closes_at) then
    return v;
  end if;

  if p_action = 'end' then
    if v.phase in ('lobby', 'podium') then
      perform public.live_finish(v.id);
      update public.sessions
         set phase = 'ended', status = 'ended', phase_opened_at = now(), phase_closes_at = null,
             paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
       where id = v.id
      returning * into v;
    else
      update public.battle_rounds set status = 'revealed', locked_at = coalesce(locked_at, now())
       where id = v_round.id and status in ('countdown', 'open');
      update public.sessions
         set phase = 'podium', phase_opened_at = now(), phase_closes_at = null,
             paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
       where id = v.id
      returning * into v;
    end if;
    return v;
  end if;

  -- next / auto
  if v.phase = 'lobby' or (v.phase = 'leaderboard' and v.current_round + 1 < v_count) then
    v_next := case when v.phase = 'lobby' then 0 else v.current_round + 1 end;
    if v_next >= v_count then
      raise exception 'no_questions' using errcode = 'P0001';
    end if;
    v_limit := public.live_time_limit_ms(v, v.question_ids[v_next + 1]);
    insert into public.battle_rounds (session_id, idx, question_id, status, time_limit_ms)
    values (v.id, v_next, v.question_ids[v_next + 1], 'countdown', v_limit)
    on conflict (session_id, idx) do update
       set status = 'countdown', opened_at = null, closes_at = null, locked_at = null;
    update public.sessions
       set phase = 'countdown', status = 'running', current_round = v_next,
           phase_opened_at = now(), phase_closes_at = now() + interval '3 seconds',
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id
    returning * into v;

  elsif v.phase = 'countdown' then
    update public.battle_rounds
       set status = 'open', opened_at = now(),
           closes_at = now() + make_interval(secs => time_limit_ms / 1000.0)
     where id = v_round.id
    returning * into v_round;
    update public.sessions
       set phase = 'open', phase_opened_at = v_round.opened_at, phase_closes_at = v_round.closes_at,
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id
    returning * into v;

  elsif v.phase = 'open' then
    update public.battle_rounds set status = 'revealed', locked_at = now() where id = v_round.id;
    -- No answer this round breaks the streak (a wrong one already did when it came in).
    update public.participants p
       set streak = 0
     where p.session_id = v.id and p.streak > 0
       and not exists (
         select 1 from public.responses r join public.attempts a on a.id = r.attempt_id
          where a.participant_id = p.id and r.question_id = v_round.question_id);
    update public.sessions
       set phase = 'reveal', phase_opened_at = now(), phase_closes_at = now() + interval '5 seconds',
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id
    returning * into v;

  elsif v.phase = 'reveal' then
    update public.sessions
       set phase = 'leaderboard', phase_opened_at = now(),
           phase_closes_at = now() + interval '5 seconds',
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id
    returning * into v;

  elsif v.phase = 'leaderboard' then
    update public.sessions
       set phase = 'podium', phase_opened_at = now(), phase_closes_at = null,
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id
    returning * into v;

  elsif v.phase = 'podium' then
    perform public.live_finish(v.id);
    update public.sessions
       set phase = 'ended', status = 'ended', phase_opened_at = now(), phase_closes_at = null,
           state_version = state_version + 1
     where id = v.id
    returning * into v;
  end if;
  return v;
end;
$$;

-- Lock the lobby or switch auto-advance.
create function public.update_live_settings(
  p_session_id   uuid,
  p_lobby_locked boolean default null,
  p_auto_advance boolean default null
)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.sessions;
begin
  update public.sessions s
     set lobby_locked = coalesce(p_lobby_locked, s.lobby_locked),
         auto_advance = coalesce(p_auto_advance, s.auto_advance),
         state_version = s.state_version + 1
   where s.id = p_session_id and s.mode = 'live'
     and exists (select 1 from public.quizzes q where q.id = s.quiz_id and q.owner_id = (select auth.uid()))
  returning * into v;
  if not found then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- Remove a participant (an unsuitable nickname): their token stops working and they
-- leave the counts and the leaderboard.
create function public.kick_participant(p_session_id uuid, p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sessions s join public.quizzes q on q.id = s.quiz_id
     where s.id = p_session_id and s.mode = 'live' and q.owner_id = (select auth.uid())
  ) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  update public.participants set kicked_at = coalesce(kicked_at, now())
   where id = p_participant_id and session_id = p_session_id;
  update public.sessions set state_version = state_version + 1 where id = p_session_id;
end;
$$;

-- ─── Participants (service_role; the caller verified the participant token) ───

-- Join under a unique nickname and get the one attempt that collects the answers.
-- Joining doesn't bump state_version: the host sees newcomers through Presence.
create function public.join_live(p_session_id uuid, p_nickname text)
returns public.participants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v             public.sessions;
  v_participant public.participants;
  v_base        text := left(btrim(p_nickname), 24);
  v_name        text;
  v_spectator   boolean := false;
begin
  select * into v from public.sessions where id = p_session_id and mode = 'live' for share;
  if not found or v.status = 'ended' or v.phase in ('podium', 'ended') then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;
  if v.lobby_locked then
    raise exception 'lobby_locked' using errcode = 'P0001';
  end if;
  if v.phase <> 'lobby' then
    case coalesce(v.policy ->> 'lateJoin', 'allow')
      when 'deny' then raise exception 'late_join_closed' using errcode = 'P0001';
      when 'spectator' then v_spectator := true;
      else null;
    end case;
  end if;
  if v_base = '' then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;

  v_name := v_base;
  for n in 2..100 loop
    begin
      insert into public.participants (session_id, nickname, is_spectator)
      values (p_session_id, v_name, v_spectator)
      returning * into v_participant;
      exit;
    exception when unique_violation then
      v_name := left(v_base, 24 - char_length(' ' || n)) || ' ' || n;
    end;
  end loop;
  if v_participant.id is null then
    raise exception 'nickname_taken' using errcode = 'P0001';
  end if;

  insert into public.attempts (session_id, participant_id, quiz_version_id, attempt_no, seed, question_ids)
  values (v.id, v_participant.id, v.quiz_version_id, 1, coalesce(v.seed, 0),
          coalesce(v.question_ids, '{}'));
  return v_participant;
end;
$$;

-- Store an answer for the open round and award speed points (docs/09 · Poin kecepatan):
--   points = round(base × ratio × (1 − elapsed / limit / 2)), plus +100 per correct answer
--   in a row from the second one, at most +500. Elapsed time comes from the database clock.
-- The caller scored the answer in TypeScript (p_correct / p_total).
create function public.record_live_answer(
  p_participant_id uuid,
  p_question_id    uuid,
  p_answer         jsonb,
  p_correct        numeric,
  p_total          numeric,
  p_base_points    int
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
  v_attempt_id  uuid;
  v_elapsed     int;
  v_ratio       numeric;
  v_streak      int;
  v_points      int;
  v_bonus       int := 0;
begin
  select * into v_participant from public.participants where id = p_participant_id for update;
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
  if v.phase is distinct from 'open' then
    raise exception 'round_closed' using errcode = 'P0001';
  end if;
  select * into v_round from public.battle_rounds where session_id = v.id and idx = v.current_round;
  if not found or v_round.question_id <> p_question_id or v_round.status <> 'open' then
    raise exception 'round_closed' using errcode = 'P0001';
  end if;
  -- One second of grace for the network; the host screen locks the round on time anyway.
  if v_round.closes_at is not null and now() > v_round.closes_at + interval '1 second' then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;

  select id into v_attempt_id from public.attempts
   where participant_id = p_participant_id and session_id = v.id and status = 'in_progress';
  if v_attempt_id is null then
    raise exception 'attempt_closed' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.responses where attempt_id = v_attempt_id and question_id = p_question_id) then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  -- While paused the clock stands still.
  v_elapsed := greatest(0, least(v_round.time_limit_ms,
    (extract(epoch from (coalesce(v.paused_at, now()) - v_round.opened_at)) * 1000)::int));
  v_ratio := case when p_total > 0 then least(1, greatest(0, p_correct / p_total)) else 0 end;
  v_points := round(greatest(0, p_base_points) * v_ratio
                    * (1 - v_elapsed::numeric / v_round.time_limit_ms / 2));
  if p_total > 0 then
    v_streak := case when v_ratio >= 1 then v_participant.streak + 1 else 0 end;
    if v_ratio >= 1 and v_streak >= 2 then
      v_bonus := least(500, 100 * (v_streak - 1));
    end if;
  else
    v_streak := v_participant.streak;  -- unscored questions don't touch the streak
  end if;

  insert into public.responses (attempt_id, question_id, answer, correct, total, points, time_ms)
  values (v_attempt_id, p_question_id, p_answer, p_correct, p_total, v_points + v_bonus, v_elapsed);
  update public.participants
     set score = score + v_points + v_bonus, streak = v_streak, last_seen_at = now()
   where id = p_participant_id;

  return jsonb_build_object('points', v_points + v_bonus, 'bonus', v_bonus,
                            'streak', v_streak, 'timeMs', v_elapsed);
end;
$$;

-- ─── State (for everyone: runs under RLS for the host, as service_role for players) ──

-- Everything a screen needs to catch up after connecting or reconnecting (P5-04):
-- phase and timers, counts, the top 5 with the points they just won and where they
-- stood before, and — with a participant — their own score, rank and answer.
create function public.live_state(p_session_id uuid, p_participant_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v       public.sessions;
  v_round public.battle_rounds;
  v_state jsonb;
begin
  select * into v from public.sessions where id = p_session_id and mode = 'live';
  if not found then
    return null;
  end if;
  if v.current_round is not null then
    select * into v_round from public.battle_rounds where session_id = v.id and idx = v.current_round;
  end if;

  v_state := jsonb_build_object(
    'sessionId', v.id,
    'versionId', v.quiz_version_id,
    'seed', v.seed,
    'policy', v.policy,
    'code', v.code,
    'version', v.state_version,
    'phase', v.phase,
    'round', v.current_round,
    'questionCount', coalesce(array_length(v.question_ids, 1), 0),
    'questionId', v_round.question_id,
    'phaseOpenedAt', v.phase_opened_at,
    'phaseClosesAt', v.phase_closes_at,
    'roundOpenedAt', v_round.opened_at,
    'roundClosesAt', v_round.closes_at,
    'timeLimitMs', v_round.time_limit_ms,
    'paused', v.paused_at is not null,
    'pausedRemainingMs', v.paused_remaining_ms,
    'lobbyLocked', v.lobby_locked,
    'autoAdvance', v.auto_advance,
    'players', (select count(*) from public.participants
                 where session_id = v.id and kicked_at is null and not is_spectator),
    'answered', case when v_round.id is null then 0 else (
      select count(*) from public.responses r
        join public.attempts a on a.id = r.attempt_id
        join public.participants p on p.id = a.participant_id
       where a.session_id = v.id and r.question_id = v_round.question_id and p.kicked_at is null)
    end,
    'top', case when v.phase in ('leaderboard', 'podium', 'ended') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'nickname', t.nickname, 'score', t.score, 'delta', t.delta,
               'rank', t.rank, 'prevRank', t.prev_rank) order by t.rank, t.nickname), '[]')
        from (
          select ranked.* from (
            select s.*, rank() over (order by s.score desc) as rank,
                        rank() over (order by s.score - s.delta desc) as prev_rank
              from (
                select p.id, p.nickname, p.score, coalesce(r.points, 0) as delta
                  from public.participants p
                  left join public.attempts a on a.participant_id = p.id and a.session_id = v.id
                  left join public.responses r
                         on r.attempt_id = a.id and r.question_id = v_round.question_id
                 where p.session_id = v.id and p.kicked_at is null and not p.is_spectator
              ) s
          ) ranked
          order by ranked.rank, ranked.nickname
          limit 5
        ) t)
    else '[]'::jsonb end
  );

  if p_participant_id is not null then
    v_state := v_state || jsonb_build_object('you', (
      select jsonb_build_object(
               'id', p.id, 'nickname', p.nickname, 'score', p.score, 'streak', p.streak,
               'kicked', p.kicked_at is not null, 'spectator', p.is_spectator,
               'rank', (select count(*) + 1 from public.participants o
                         where o.session_id = v.id and o.kicked_at is null and not o.is_spectator
                           and o.score > p.score),
               'answer', (select jsonb_build_object('answer', r.answer, 'correct', r.correct,
                                                    'total', r.total, 'points', r.points,
                                                    'timeMs', r.time_ms)
                            from public.responses r join public.attempts a on a.id = r.attempt_id
                           where a.participant_id = p.id and a.session_id = v.id
                             and r.question_id = v_round.question_id))
        from public.participants p
       where p.id = p_participant_id and p.session_id = v.id));
  end if;
  return v_state;
end;
$$;

revoke all on function public.live_time_limit_ms(public.sessions, uuid) from public, anon;
revoke all on function public.live_finish(uuid) from public, anon, authenticated;
revoke all on function public.advance_live(uuid, int, text) from public, anon;
revoke all on function public.update_live_settings(uuid, boolean, boolean) from public, anon;
revoke all on function public.kick_participant(uuid, uuid) from public, anon;
revoke all on function public.join_live(uuid, text) from public, anon, authenticated;
revoke all on function public.record_live_answer(uuid, uuid, jsonb, numeric, numeric, int)
  from public, anon, authenticated;
revoke all on function public.live_state(uuid, uuid) from public, anon;

grant execute on function public.live_time_limit_ms(public.sessions, uuid) to authenticated, service_role;
grant execute on function public.live_finish(uuid) to service_role;
grant execute on function public.advance_live(uuid, int, text) to authenticated;
grant execute on function public.update_live_settings(uuid, boolean, boolean) to authenticated;
grant execute on function public.kick_participant(uuid, uuid) to authenticated;
grant execute on function public.join_live(uuid, text) to service_role;
grant execute on function public.record_live_answer(uuid, uuid, jsonb, numeric, numeric, int)
  to service_role;
grant execute on function public.live_state(uuid, uuid) to authenticated, service_role;
