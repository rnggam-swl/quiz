-- P6 · Battle: Rebutan (docs/10-mode-battle.md). Same sessions, phases and rounds as
-- live (P5); what differs is the open round: one chance per question, the first
-- correct answer the database receives wins and locks the round for everyone, in the
-- same transaction that moves the session to the reveal.

-- ─── Answers & winners ────────────────────────────────────────────────────────

create table public.battle_answers (
  id             uuid primary key default gen_random_uuid(),
  round_id       uuid not null references public.battle_rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  answer         jsonb not null,
  correct        boolean not null,
  -- The winner's points, a wrong answer's penalty (negative), otherwise 0.
  points         int not null default 0,
  -- Time since the round opened, database clock (tie-breaks, reports).
  reaction_ms    int check (reaction_ms >= 0),
  received_at    timestamptz not null default now(),
  unique (round_id, participant_id)     -- one chance per question
);
create index battle_answers_participant_idx on public.battle_answers (participant_id);

create table public.round_winners (       -- one winner per round
  round_id       uuid primary key references public.battle_rounds (id) on delete cascade,
  participant_id uuid not null references public.participants (id) on delete cascade,
  won_at         timestamptz not null default now()
);
create index round_winners_participant_idx on public.round_winners (participant_id);

alter table public.battle_answers enable row level security;
alter table public.round_winners  enable row level security;

create policy "battle answers: host reads" on public.battle_answers
  for select to authenticated
  using (exists (
    select 1 from public.battle_rounds r where r.id = round_id and public.owns_session(r.session_id)
  ));
create policy "round winners: host reads" on public.round_winners
  for select to authenticated
  using (exists (
    select 1 from public.battle_rounds r where r.id = round_id and public.owns_session(r.session_id)
  ));

revoke all on public.battle_answers, public.round_winners from anon;
grant select on public.battle_answers, public.round_winners to authenticated;
grant select, insert, update, delete on public.battle_answers, public.round_winners to service_role;

-- ─── Live functions for every game mode ───────────────────────────────────────
-- Unchanged from 20260928000000_live.sql except that they accept battle sessions too.

-- Move a live session along (docs/09 · State machine). p_version must match
-- state_version, so a double press or a second host tab can't skip a phase.
--   next   : the host pressed "Lanjut" (always allowed)
--   auto   : a timer ran out on the host screen (only once now() ≥ phase_closes_at)
--   pause / resume : freeze and continue the phase timer
--   end    : straight to the podium (or ended from the lobby/podium)
create or replace function public.advance_live(p_session_id uuid, p_version int, p_action text)
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
   where s.id = p_session_id and s.mode in ('live', 'battle_buzzer', 'battle_royale') and q.owner_id = (select auth.uid())
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
create or replace function public.update_live_settings(
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
   where s.id = p_session_id and s.mode in ('live', 'battle_buzzer', 'battle_royale')
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
create or replace function public.kick_participant(p_session_id uuid, p_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sessions s join public.quizzes q on q.id = s.quiz_id
     where s.id = p_session_id and s.mode in ('live', 'battle_buzzer', 'battle_royale') and q.owner_id = (select auth.uid())
  ) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  update public.participants set kicked_at = coalesce(kicked_at, now())
   where id = p_participant_id and session_id = p_session_id;
  update public.sessions set state_version = state_version + 1 where id = p_session_id;
end;
$$;

-- Join under a unique nickname and get the one attempt that collects the answers.
-- Joining doesn't bump state_version: the host sees newcomers through Presence.
create or replace function public.join_live(p_session_id uuid, p_nickname text)
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
  select * into v from public.sessions where id = p_session_id and mode in ('live', 'battle_buzzer', 'battle_royale') for share;
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

-- ─── Participants: the buzzer answer (service_role) ───────────────────────────

-- Store a Rebutan answer (docs/10 · Menentukan pemenang secara adil). The round row is
-- locked `for update`, so answers to one round are handled one at a time: the first
-- correct one wins, locks the round and moves the session to the reveal; later ones
-- find the round closed. The caller scored the answer in TypeScript (p_correct).
create function public.record_battle_answer(
  p_participant_id uuid,
  p_question_id    uuid,
  p_answer         jsonb,
  p_correct        boolean,
  p_points         int,
  p_penalty        int default 0
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
  v_elapsed     int;
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
  if not found or v.phase is distinct from 'open' or v_round.status <> 'open'
     or v_round.question_id <> p_question_id then
    select jsonb_build_object('id', p.id, 'nickname', p.nickname) into v_winner
      from public.round_winners w join public.participants p on p.id = w.participant_id
     where w.round_id = v_round.id;
    return jsonb_build_object('accepted', false, 'reason', 'round_closed', 'winner', v_winner);
  end if;
  if v_round.closes_at is not null and now() > v_round.closes_at + interval '1 second' then
    return jsonb_build_object('accepted', false, 'reason', 'deadline_passed');
  end if;

  v_elapsed := greatest(0, least(v_round.time_limit_ms,
    (extract(epoch from (coalesce(v.paused_at, now()) - v_round.opened_at)) * 1000)::int));
  insert into public.battle_answers (round_id, participant_id, answer, correct, reaction_ms)
  values (v_round.id, p_participant_id, p_answer, p_correct, v_elapsed)
  on conflict (round_id, participant_id) do nothing;
  if not found then
    return jsonb_build_object('accepted', false, 'reason', 'already_answered');
  end if;

  if p_correct then
    insert into public.round_winners (round_id, participant_id)
    values (v_round.id, p_participant_id)
    on conflict (round_id) do nothing;
    v_won := found;
  end if;

  if v_won then
    v_points := greatest(0, p_points);
    update public.participants
       set score = score + v_points, streak = streak + 1, last_seen_at = now()
     where id = p_participant_id;
    -- A win in a row counts; anyone else's run ends here.
    update public.participants set streak = 0
     where session_id = v.id and id <> p_participant_id and streak > 0;
    update public.battle_rounds set status = 'revealed', locked_at = now() where id = v_round.id;
    update public.sessions
       set phase = 'reveal', phase_opened_at = now(), phase_closes_at = now() + interval '5 seconds',
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id;
  elsif not p_correct and p_penalty > 0 then
    -- The penalty never takes a score below zero.
    v_points := -least(greatest(0, p_penalty), v_participant.score);
    update public.participants set score = score + v_points, streak = 0, last_seen_at = now()
     where id = p_participant_id;
  else
    update public.participants set streak = 0, last_seen_at = now() where id = p_participant_id;
  end if;
  if v_points <> 0 then
    update public.battle_answers set points = v_points
     where round_id = v_round.id and participant_id = p_participant_id;
  end if;

  return jsonb_build_object('accepted', true, 'won', v_won, 'correct', p_correct,
                            'points', v_points, 'reactionMs', v_elapsed);
end;
$$;

-- ─── State for every game mode ────────────────────────────────────────────────

-- Answers to one round, whichever table the mode keeps them in (live: responses via the
-- participant's attempt; battle: battle_answers). Same columns for both.
create function public.round_answers(p_session public.sessions, p_round public.battle_rounds)
returns table (participant_id uuid, answer jsonb, correct numeric, total numeric,
               points int, time_ms int)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.participant_id, r.answer, r.correct, r.total, r.points, r.time_ms
    from public.responses r join public.attempts a on a.id = r.attempt_id
   where p_session.mode = 'live' and a.session_id = p_session.id
     and r.question_id = p_round.question_id
  union all
  select b.participant_id, b.answer, case when b.correct then 1 else 0 end, 1, b.points, b.reaction_ms
    from public.battle_answers b
   where p_session.mode <> 'live' and b.round_id = p_round.id;
$$;

-- live_state for live and battle: adds the mode, the round id, the round's winner, and
-- each leaderboard row's wins.
create or replace function public.live_state(p_session_id uuid, p_participant_id uuid default null)
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
  select * into v from public.sessions
   where id = p_session_id and mode in ('live', 'battle_buzzer', 'battle_royale');
  if not found then
    return null;
  end if;
  if v.current_round is not null then
    select * into v_round from public.battle_rounds where session_id = v.id and idx = v.current_round;
  end if;

  v_state := jsonb_build_object(
    'sessionId', v.id,
    'mode', v.mode,
    'versionId', v.quiz_version_id,
    'seed', v.seed,
    'policy', v.policy,
    'code', v.code,
    'version', v.state_version,
    'phase', v.phase,
    'round', v.current_round,
    'roundId', v_round.id,
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
      select count(*) from public.round_answers(v, v_round) ra
        join public.participants p on p.id = ra.participant_id
       where p.kicked_at is null)
    end,
    'winner', case when v_round.id is null then null else (
      select jsonb_build_object('id', p.id, 'nickname', p.nickname)
        from public.round_winners w join public.participants p on p.id = w.participant_id
       where w.round_id = v_round.id)
    end,
    'top', case when v.phase in ('leaderboard', 'podium', 'ended') then (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'nickname', t.nickname, 'score', t.score, 'delta', t.delta,
               'rank', t.rank, 'prevRank', t.prev_rank, 'wins', t.wins)
               order by t.rank, t.nickname), '[]')
        from (
          select ranked.* from (
            select s.*, rank() over (order by s.score desc) as rank,
                        rank() over (order by s.score - s.delta desc) as prev_rank
              from (
                select p.id, p.nickname, p.score, coalesce(ra.points, 0) as delta,
                       (select count(*) from public.round_winners w
                          join public.battle_rounds br on br.id = w.round_id
                         where w.participant_id = p.id and br.session_id = v.id) as wins
                  from public.participants p
                  left join public.round_answers(v, v_round) ra on ra.participant_id = p.id
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
               'answer', case when v_round.id is null then null else (
                 select jsonb_build_object('answer', ra.answer, 'correct', ra.correct,
                                           'total', ra.total, 'points', ra.points,
                                           'timeMs', ra.time_ms)
                   from public.round_answers(v, v_round) ra
                  where ra.participant_id = p.id)
               end)
        from public.participants p
       where p.id = p_participant_id and p.session_id = v.id));
  end if;
  return v_state;
end;
$$;

revoke all on function public.record_battle_answer(uuid, uuid, jsonb, boolean, int, int)
  from public, anon, authenticated;
revoke all on function public.round_answers(public.sessions, public.battle_rounds) from public, anon;
grant execute on function public.record_battle_answer(uuid, uuid, jsonb, boolean, int, int)
  to service_role;
grant execute on function public.round_answers(public.sessions, public.battle_rounds)
  to authenticated, service_role;
