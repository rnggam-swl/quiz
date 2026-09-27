-- P4 · Exam mode: roster, integrity events, manual grading, result release and expiry.
-- Design: docs/08-mode-exam.md, docs/03-data-model.md.
-- Participants still go through Server Actions + service_role RPCs; hosts act on their
-- own sessions through RLS or the owner-checked RPCs at the end of this file.

-- ─── Sessions: exam title and result release ──────────────────────────────────

alter table public.sessions
  add column title               text check (char_length(title) <= 120),
  add column results_released_at timestamptz;

-- ─── Roster (daftar peserta) ──────────────────────────────────────────────────

create table public.session_roster (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  -- NIS, student number or e-mail: what the participant types to get in.
  identifier     text not null check (char_length(btrim(identifier)) between 1 and 120),
  -- Accommodation: extra time on the exam duration, e.g. 25 = +25%.
  extra_time_pct int not null default 0 check (extra_time_pct between 0 and 200),
  created_at     timestamptz not null default now()
);

create unique index session_roster_identifier_idx
  on public.session_roster (session_id, lower(btrim(identifier)));

-- Roster names can be longer than a typed nickname.
alter table public.participants drop constraint participants_nickname_check;
alter table public.participants
  add constraint participants_nickname_check check (char_length(nickname) between 1 and 60),
  add column roster_id uuid references public.session_roster (id) on delete set null;

create unique index participants_roster_idx on public.participants (session_id, roster_id)
  where roster_id is not null;
create unique index participants_user_idx on public.participants (session_id, user_id)
  where user_id is not null;

-- ─── Manual grading ───────────────────────────────────────────────────────────

alter table public.responses
  add column graded_by     uuid references public.profiles (id) on delete set null,
  add column graded_at     timestamptz,
  add column feedback      text check (char_length(feedback) <= 2000),
  add column rubric_scores jsonb check (rubric_scores is null or jsonb_typeof(rubric_scores) = 'array');

-- ─── Integrity events ─────────────────────────────────────────────────────────

create table public.integrity_events (
  id         bigint generated always as identity primary key,
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  kind       text not null
             check (kind in ('tab_hidden', 'fullscreen_exit', 'copy', 'paste', 'resize', 'multi_device')),
  at         timestamptz not null default now(),
  meta       jsonb not null default '{}'
             check (jsonb_typeof(meta) = 'object' and pg_column_size(meta) <= 1000)
);

create index integrity_events_attempt_idx on public.integrity_events (attempt_id, at);

-- expire_attempts() runs every minute and only looks at running attempts with a deadline.
create index attempts_open_deadline_idx on public.attempts (deadline)
  where status = 'in_progress' and deadline is not null;

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.session_roster   enable row level security;
alter table public.integrity_events enable row level security;

create policy "roster: host manages" on public.session_roster
  for all to authenticated
  using (public.owns_session(session_id)) with check (public.owns_session(session_id));

create policy "integrity: host reads" on public.integrity_events
  for select to authenticated
  using (exists (
    select 1 from public.attempts a where a.id = attempt_id and public.owns_session(a.session_id)
  ));

revoke all on public.session_roster, public.integrity_events from anon;
grant select, insert, update, delete on public.session_roster to authenticated;
grant select on public.integrity_events to authenticated;
grant select, insert, update, delete on public.session_roster, public.integrity_events to service_role;

-- ─── Participant flow (service_role only; the caller has verified the token) ──

-- Join an exam. With an identifier the participant must be on the roster (and gets the
-- roster name); with a user id they're the signed-in account. Either way, joining again
-- returns the same participant, so an exam can be resumed on another device.
create function public.join_exam(
  p_session_id uuid,
  p_nickname   text,
  p_user_id    uuid default null,
  p_identifier text default null
)
returns public.participants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session     public.sessions;
  v_roster      public.session_roster;
  v_participant public.participants;
  v_base        text;
  v_name        text;
begin
  select * into v_session from public.sessions where id = p_session_id for share;
  if not found
     or v_session.status not in ('lobby', 'running')
     or (v_session.opens_at is not null and now() < v_session.opens_at)
     or (v_session.closes_at is not null and now() >= v_session.closes_at) then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;

  if p_identifier is not null then
    select * into v_roster
      from public.session_roster
     where session_id = p_session_id and lower(btrim(identifier)) = lower(btrim(p_identifier));
    if not found then
      raise exception 'not_on_roster' using errcode = 'P0001';
    end if;
    select * into v_participant
      from public.participants where session_id = p_session_id and roster_id = v_roster.id;
    if found then
      return v_participant;
    end if;
    v_base := left(btrim(v_roster.name), 60);
  elsif p_user_id is not null then
    select * into v_participant
      from public.participants where session_id = p_session_id and user_id = p_user_id;
    if found then
      return v_participant;
    end if;
    v_base := left(btrim(p_nickname), 60);
  else
    v_base := left(btrim(p_nickname), 60);
  end if;

  if coalesce(v_base, '') = '' then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;

  v_name := v_base;
  for n in 2..100 loop
    begin
      insert into public.participants (session_id, nickname, user_id, roster_id)
      values (p_session_id, v_name, p_user_id, v_roster.id)
      returning * into v_participant;
      return v_participant;
    exception when unique_violation then
      -- Two people racing for the same roster entry or account: hand back the winner.
      if v_roster.id is not null then
        select * into v_participant
          from public.participants where session_id = p_session_id and roster_id = v_roster.id;
        if found then return v_participant; end if;
      elsif p_user_id is not null then
        select * into v_participant
          from public.participants where session_id = p_session_id and user_id = p_user_id;
        if found then return v_participant; end if;
      end if;
      v_name := left(v_base, 60 - char_length(' ' || n)) || ' ' || n;
    end;
  end loop;
  raise exception 'nickname_taken' using errcode = 'P0001';
end;
$$;

-- start_attempt, now exam-aware: refuses before opens_at, caps the deadline at closes_at,
-- adds the roster accommodation, and stores max_score up front (expiry needs it).
drop function public.start_attempt(uuid, uuid, bigint, uuid[], int, int);

create function public.start_attempt(
  p_participant_id  uuid,
  p_quiz_version_id uuid,
  p_seed            bigint,
  p_question_ids    uuid[],
  p_max_attempts    int,
  p_duration_s      int default null,
  p_max_score       numeric default null
)
returns public.attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_participant public.participants;
  v_session     public.sessions;
  v_attempt     public.attempts;
  v_count       int;
  v_extra_pct   int := 0;
  v_deadline    timestamptz;
begin
  select * into v_participant from public.participants where id = p_participant_id for update;
  if not found then
    raise exception 'participant_not_found' using errcode = 'P0002';
  end if;

  select * into v_attempt
    from public.attempts
   where participant_id = p_participant_id and status = 'in_progress';
  if found then
    return v_attempt;
  end if;

  select * into v_session from public.sessions where id = v_participant.session_id;
  if v_session.status not in ('lobby', 'running')
     or (v_session.opens_at is not null and now() < v_session.opens_at)
     or (v_session.closes_at is not null and now() >= v_session.closes_at) then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.attempts where participant_id = p_participant_id;
  if p_max_attempts > 0 and v_count >= p_max_attempts then
    raise exception 'attempt_limit' using errcode = 'P0001';
  end if;

  if v_participant.roster_id is not null then
    select extra_time_pct into v_extra_pct
      from public.session_roster where id = v_participant.roster_id;
  end if;

  -- deadline = min(start + duration × (1 + extra%), closes_at); least() skips nulls.
  if p_duration_s is not null then
    v_deadline := least(
      now() + make_interval(secs => round(p_duration_s * (1 + coalesce(v_extra_pct, 0) / 100.0))),
      v_session.closes_at
    );
  else
    v_deadline := v_session.closes_at;
  end if;

  insert into public.attempts
    (session_id, participant_id, quiz_version_id, attempt_no, seed, question_ids, deadline, max_score)
  values (
    v_participant.session_id, p_participant_id, p_quiz_version_id, v_count + 1, p_seed,
    p_question_ids, v_deadline, p_max_score
  )
  returning * into v_attempt;

  update public.participants set last_seen_at = now() where id = p_participant_id;
  return v_attempt;
end;
$$;

-- submit_attempt: a submission after the deadline (+5 s grace) closes as 'expired', and
-- submitting a closed attempt again is a no-op.
create or replace function public.submit_attempt(
  p_attempt_id uuid,
  p_max_score  numeric,
  p_xp         int,
  p_max_streak int
)
returns public.attempts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt public.attempts;
  v_late    boolean;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status in ('submitted', 'expired') then
    return v_attempt;
  end if;

  v_late := v_attempt.deadline is not null and now() > v_attempt.deadline + interval '5 seconds';
  update public.attempts a
     set status       = case when v_late then 'expired'::public.attempt_status else 'submitted' end,
         submitted_at = case when v_late then a.deadline else now() end,
         score        = coalesce((select sum(points) from public.responses where attempt_id = a.id), 0),
         max_score    = coalesce(p_max_score, a.max_score),
         xp           = p_xp,
         max_streak   = p_max_streak
   where a.id = p_attempt_id
  returning * into v_attempt;

  update public.participants set last_seen_at = now() where id = v_attempt.participant_id;
  return v_attempt;
end;
$$;

-- Close every attempt whose deadline (+5 s grace) has passed, scoring what was saved.
-- Run by pg_cron each minute; the server also treats overdue attempts as closed.
create function public.expire_attempts()
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  update public.attempts a
     set status       = 'expired',
         submitted_at = a.deadline,
         score        = coalesce((select sum(points) from public.responses r where r.attempt_id = a.id), 0)
   where a.status = 'in_progress'
     and a.deadline is not null
     and a.deadline + interval '5 seconds' < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Store a batch of integrity events (validated in TypeScript first).
create function public.log_integrity_events(p_attempt_id uuid, p_events jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_count int;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 50 then
    raise exception 'invalid_events' using errcode = '22023';
  end if;
  if not exists (select 1 from public.attempts where id = p_attempt_id) then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  insert into public.integrity_events (attempt_id, kind, at, meta)
  select p_attempt_id,
         e ->> 'kind',
         -- A client clock that runs ahead can't log events in the future.
         least(coalesce((e ->> 'at')::timestamptz, now()), now()),
         coalesce(e -> 'meta', '{}'::jsonb)
    from jsonb_array_elements(p_events) e;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.join_exam(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.start_attempt(uuid, uuid, bigint, uuid[], int, int, numeric) from public, anon, authenticated;
revoke all on function public.expire_attempts() from public, anon, authenticated;
revoke all on function public.log_integrity_events(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.join_exam(uuid, text, uuid, text) to service_role;
grant execute on function public.start_attempt(uuid, uuid, bigint, uuid[], int, int, numeric) to service_role;
grant execute on function public.expire_attempts() to service_role;
grant execute on function public.log_integrity_events(uuid, jsonb) to service_role;

-- ─── Host actions on attempts (owner-checked; run with definer rights) ────────

create function public.host_owns_attempt(p_attempt_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.attempts a
      join public.sessions s on s.id = a.session_id
      join public.quizzes q on q.id = s.quiz_id
     where a.id = p_attempt_id and q.owner_id = (select auth.uid())
  );
$$;

-- Give a running attempt more time (accommodation, technical trouble).
create function public.extend_attempt(p_attempt_id uuid, p_minutes int)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts;
begin
  if not public.host_owns_attempt(p_attempt_id) then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if p_minutes not between 1 and 600 then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;
  update public.attempts
     set deadline = greatest(coalesce(deadline, now()), now()) + make_interval(mins => p_minutes)
   where id = p_attempt_id and status = 'in_progress'
  returning * into v_attempt;
  if not found then
    raise exception 'attempt_closed' using errcode = 'P0001';
  end if;
  return v_attempt;
end;
$$;

-- Reopen a submitted/expired attempt for p_minutes more.
create function public.reopen_attempt(p_attempt_id uuid, p_minutes int)
returns public.attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.attempts;
begin
  if not public.host_owns_attempt(p_attempt_id) then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if p_minutes not between 1 and 600 then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;
  update public.attempts
     set status = 'in_progress', submitted_at = null,
         deadline = now() + make_interval(mins => p_minutes)
   where id = p_attempt_id and status in ('submitted', 'expired')
  returning * into v_attempt;
  if not found then
    raise exception 'attempt_open' using errcode = 'P0001';
  end if;
  return v_attempt;
exception when unique_violation then
  -- The participant already has another attempt in progress.
  raise exception 'attempt_open' using errcode = 'P0001';
end;
$$;

-- Throw an attempt away so the participant can start over.
create function public.reset_attempt(p_attempt_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.host_owns_attempt(p_attempt_id) then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  delete from public.attempts where id = p_attempt_id;
end;
$$;

-- Grade one response by hand (essays). Points come from the question in the attempt's
-- published version, so the host only picks the ratio. A closed attempt's total follows.
create function public.grade_response(
  p_response_id uuid,
  p_ratio       numeric,
  p_feedback    text default null,
  p_rubric      jsonb default null
)
returns public.responses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_response public.responses;
  v_attempt  public.attempts;
  v_points   int;
begin
  select * into v_response from public.responses where id = p_response_id for update;
  if not found or not public.host_owns_attempt(v_response.attempt_id) then
    raise exception 'response_not_found' using errcode = 'P0002';
  end if;
  if p_ratio is null or p_ratio < 0 or p_ratio > 1 then
    raise exception 'invalid_ratio' using errcode = '22023';
  end if;

  select * into v_attempt from public.attempts where id = v_response.attempt_id;
  select coalesce((q ->> 'points')::int, 0) into v_points
    from public.quiz_versions v, jsonb_array_elements(v.snapshot -> 'questions') q
   where v.id = v_attempt.quiz_version_id and q ->> 'id' = v_response.question_id::text;

  update public.responses
     set correct = p_ratio, total = 1, points = round(coalesce(v_points, 0) * p_ratio),
         feedback = nullif(btrim(p_feedback), ''), rubric_scores = p_rubric,
         graded_by = (select auth.uid()), graded_at = now()
   where id = p_response_id
  returning * into v_response;

  if v_attempt.status <> 'in_progress' then
    update public.attempts
       set score = coalesce((select sum(points) from public.responses where attempt_id = v_attempt.id), 0)
     where id = v_attempt.id;
  end if;
  return v_response;
end;
$$;

-- End an exam now: close its window and pull every running attempt's deadline in, so
-- no answer is accepted after the grace period. Frees the join code.
create function public.end_exam(p_session_id uuid)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  if not exists (
    select 1 from public.sessions s join public.quizzes q on q.id = s.quiz_id
     where s.id = p_session_id and s.mode = 'exam' and q.owner_id = (select auth.uid())
  ) then
    raise exception 'session_not_found' using errcode = 'P0002';
  end if;
  update public.sessions
     set status = 'ended',
         closes_at = least(coalesce(closes_at, now()), now()),
         opens_at = least(opens_at, now() - interval '1 second')
   where id = p_session_id
  returning * into v_session;
  update public.attempts
     set deadline = least(coalesce(deadline, now()), now())
   where session_id = p_session_id and status = 'in_progress';
  return v_session;
end;
$$;

revoke all on function public.end_exam(uuid) from public, anon;
grant execute on function public.end_exam(uuid) to authenticated;

revoke all on function public.host_owns_attempt(uuid) from public, anon;
revoke all on function public.extend_attempt(uuid, int) from public, anon;
revoke all on function public.reopen_attempt(uuid, int) from public, anon;
revoke all on function public.reset_attempt(uuid) from public, anon;
revoke all on function public.grade_response(uuid, numeric, text, jsonb) from public, anon;
grant execute on function public.host_owns_attempt(uuid) to authenticated;
grant execute on function public.extend_attempt(uuid, int) to authenticated;
grant execute on function public.reopen_attempt(uuid, int) to authenticated;
grant execute on function public.reset_attempt(uuid) to authenticated;
grant execute on function public.grade_response(uuid, numeric, text, jsonb) to authenticated;

-- ─── Expiry every minute (pg_cron where available: Supabase has it, test DBs don't) ─

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('expire-exam-attempts', '* * * * *', 'select public.expire_attempts()');
  end if;
end;
$$;
