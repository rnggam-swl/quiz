-- P2 · Sessions, participants, attempts and responses (practice mode + embed).
-- Design: docs/03-data-model.md, docs/06-mode-practice.md, docs/07-embed.md.
-- Participants never touch these tables directly: Server Actions verify their
-- signed participant token and call the service_role-only RPCs below.
-- Hosts read their own sessions' data through RLS.

create type public.session_mode as enum ('practice', 'exam', 'live', 'battle_buzzer', 'battle_royale');
create type public.session_status as enum ('draft', 'scheduled', 'lobby', 'running', 'paused', 'ended');
create type public.attempt_status as enum ('in_progress', 'submitted', 'expired');

-- ─── Sessions ─────────────────────────────────────────────────────────────────

create table public.sessions (
  id              uuid primary key default gen_random_uuid(),
  quiz_id         uuid not null references public.quizzes (id) on delete cascade,
  -- Pinned version; null = always play the quiz's latest published version.
  quiz_version_id uuid references public.quiz_versions (id) on delete cascade,
  host_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  mode            public.session_mode not null,
  policy          jsonb not null default '{}' check (jsonb_typeof(policy) = 'object'),
  code            text check (code ~ '^[0-9]{6}$'),
  status          public.session_status not null default 'running',
  -- The quiz's standing practice session, shared by its link, code and embed.
  is_default      boolean not null default false,
  opens_at        timestamptz,
  closes_at       timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (opens_at is null or closes_at is null or opens_at < closes_at)
);

create unique index sessions_active_code_idx on public.sessions (code)
  where status in ('scheduled', 'lobby', 'running', 'paused');
create unique index sessions_default_per_quiz_idx on public.sessions (quiz_id) where is_default;
create index sessions_quiz_idx on public.sessions (quiz_id);

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

-- ─── Participants ─────────────────────────────────────────────────────────────

create table public.participants (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references public.sessions (id) on delete cascade,
  -- Signed-in participant (exam with login, P4); null for token-based guests.
  user_id      uuid references auth.users (id) on delete set null,
  -- `sub` from an embed token issued by the embedding site (docs/07-embed.md).
  external_id  text check (char_length(external_id) <= 200),
  nickname     text not null check (char_length(nickname) between 1 and 24),
  joined_at    timestamptz not null default now(),
  last_seen_at timestamptz
);

create unique index participants_nickname_idx on public.participants (session_id, lower(nickname));
create unique index participants_external_idx on public.participants (session_id, external_id)
  where external_id is not null;

-- ─── Attempts & responses ─────────────────────────────────────────────────────

create table public.attempts (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  participant_id  uuid not null references public.participants (id) on delete cascade,
  quiz_version_id uuid not null references public.quiz_versions (id) on delete cascade,
  attempt_no      int not null check (attempt_no >= 1),
  seed            bigint not null,
  question_ids    uuid[] not null,
  started_at      timestamptz not null default now(),
  deadline        timestamptz,
  submitted_at    timestamptz,
  status          public.attempt_status not null default 'in_progress',
  score           numeric,
  max_score       numeric,
  xp              int,
  max_streak      int,
  unique (participant_id, attempt_no)
);

create unique index attempts_one_open_idx on public.attempts (participant_id)
  where status = 'in_progress';
create index attempts_session_idx on public.attempts (session_id, started_at desc);

create table public.responses (
  id          uuid primary key default gen_random_uuid(),
  attempt_id  uuid not null references public.attempts (id) on delete cascade,
  question_id uuid not null,
  answer      jsonb not null,
  correct     numeric,           -- null = waiting for manual grading (P4)
  total       numeric,
  points      int not null default 0,
  time_ms     int check (time_ms >= 0),
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id)
);

-- ─── Embed secrets ────────────────────────────────────────────────────────────

-- HS256 secret the embedding site signs embed tokens with (docs/07-embed.md).
create table public.quiz_embed_secrets (
  quiz_id    uuid primary key references public.quizzes (id) on delete cascade,
  secret     text not null check (char_length(secret) >= 32),
  created_at timestamptz not null default now()
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.sessions           enable row level security;
alter table public.participants       enable row level security;
alter table public.attempts           enable row level security;
alter table public.responses          enable row level security;
alter table public.quiz_embed_secrets enable row level security;

create function public.owns_session(p_session_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.sessions s
      join public.quizzes q on q.id = s.quiz_id
     where s.id = p_session_id and q.owner_id = (select auth.uid())
  );
$$;

create policy "sessions: owner reads" on public.sessions
  for select to authenticated using (public.owns_quiz(quiz_id));
create policy "sessions: owner creates" on public.sessions
  for insert to authenticated
  with check (public.owns_quiz(quiz_id) and host_id = (select auth.uid()));
create policy "sessions: owner updates" on public.sessions
  for update to authenticated
  using (public.owns_quiz(quiz_id)) with check (public.owns_quiz(quiz_id));
create policy "sessions: owner deletes" on public.sessions
  for delete to authenticated using (public.owns_quiz(quiz_id));

create policy "participants: host reads" on public.participants
  for select to authenticated using (public.owns_session(session_id));
create policy "attempts: host reads" on public.attempts
  for select to authenticated using (public.owns_session(session_id));
create policy "responses: host reads" on public.responses
  for select to authenticated
  using (exists (
    select 1 from public.attempts a where a.id = attempt_id and public.owns_session(a.session_id)
  ));

create policy "embed secrets: owner manages" on public.quiz_embed_secrets
  for all to authenticated using (public.owns_quiz(quiz_id)) with check (public.owns_quiz(quiz_id));

revoke all on public.sessions, public.participants, public.attempts, public.responses,
  public.quiz_embed_secrets from anon;
grant select, insert, update, delete on public.sessions, public.quiz_embed_secrets to authenticated;
grant select on public.participants, public.attempts, public.responses to authenticated;

-- ─── Host: the quiz's shareable practice session ──────────────────────────────

create function public.generate_session_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_code text;
begin
  for i in 1..50 loop
    v_code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    if not exists (
      select 1 from public.sessions
       where code = v_code and status in ('scheduled', 'lobby', 'running', 'paused')
    ) then
      return v_code;
    end if;
  end loop;
  raise exception 'no_free_code' using errcode = 'P0001';
end;
$$;

-- Get (or create) the quiz's default practice session. Runs as the host (RLS).
create function public.ensure_practice_session(p_quiz_id uuid, p_policy jsonb default '{}')
returns public.sessions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session public.sessions;
begin
  select * into v_session from public.sessions where quiz_id = p_quiz_id and is_default;
  if found then
    return v_session;
  end if;

  if not exists (select 1 from public.quizzes where id = p_quiz_id) then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.quizzes where id = p_quiz_id and latest_version is not null) then
    raise exception 'not_published' using errcode = 'P0001';
  end if;

  for i in 1..5 loop
    begin
      insert into public.sessions (quiz_id, mode, policy, code, is_default)
      values (p_quiz_id, 'practice', coalesce(p_policy, '{}'), public.generate_session_code(), true)
      returning * into v_session;
      return v_session;
    exception when unique_violation then
      -- Lost a race on the code or the default slot: re-read, then retry.
      select * into v_session from public.sessions where quiz_id = p_quiz_id and is_default;
      if found then
        return v_session;
      end if;
    end;
  end loop;
  raise exception 'no_free_code' using errcode = 'P0001';
end;
$$;

-- ─── Participant flow (service_role only; the caller has verified the token) ──

-- Join a session under a unique nickname ("Budi", "Budi 2", …). With an
-- external id (embed token), joining again returns the same participant.
create function public.join_session(p_session_id uuid, p_nickname text, p_external_id text default null)
returns public.participants
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_session     public.sessions;
  v_participant public.participants;
  v_base        text := left(btrim(p_nickname), 24);
  v_name        text;
begin
  select * into v_session from public.sessions where id = p_session_id for share;
  if not found
     or v_session.status not in ('lobby', 'running')
     or (v_session.opens_at is not null and now() < v_session.opens_at)
     or (v_session.closes_at is not null and now() >= v_session.closes_at) then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;
  if v_base = '' then
    raise exception 'invalid_nickname' using errcode = '22023';
  end if;

  if p_external_id is not null then
    select * into v_participant
      from public.participants
     where session_id = p_session_id and external_id = p_external_id;
    if found then
      return v_participant;
    end if;
  end if;

  v_name := v_base;
  for n in 2..100 loop
    begin
      insert into public.participants (session_id, nickname, external_id)
      values (p_session_id, v_name, p_external_id)
      returning * into v_participant;
      return v_participant;
    exception when unique_violation then
      v_name := left(v_base, 24 - char_length(' ' || n)) || ' ' || n;
    end;
  end loop;
  raise exception 'nickname_taken' using errcode = 'P0001';
end;
$$;

-- Resume the participant's open attempt, or start a new one. Question order,
-- seed and version are chosen in TypeScript (policy, stripAnswers) and passed in.
create function public.start_attempt(
  p_participant_id  uuid,
  p_quiz_version_id uuid,
  p_seed            bigint,
  p_question_ids    uuid[],
  p_max_attempts    int,
  p_duration_s      int default null
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
     or (v_session.closes_at is not null and now() >= v_session.closes_at) then
    raise exception 'session_closed' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.attempts where participant_id = p_participant_id;
  if p_max_attempts > 0 and v_count >= p_max_attempts then
    raise exception 'attempt_limit' using errcode = 'P0001';
  end if;

  insert into public.attempts
    (session_id, participant_id, quiz_version_id, attempt_no, seed, question_ids, deadline)
  values (
    v_participant.session_id,
    p_participant_id,
    p_quiz_version_id,
    v_count + 1,
    p_seed,
    p_question_ids,
    case when p_duration_s is null then null else now() + make_interval(secs => p_duration_s) end
  )
  returning * into v_attempt;

  update public.participants set last_seen_at = now() where id = p_participant_id;
  return v_attempt;
end;
$$;

-- Store a graded answer. The caller scored it in TypeScript. With
-- p_allow_change = false (instant feedback) the first answer is final.
create function public.record_response(
  p_attempt_id   uuid,
  p_question_id  uuid,
  p_answer       jsonb,
  p_correct      numeric,
  p_total        numeric,
  p_points       int,
  p_time_ms      int,
  p_allow_change boolean
)
returns public.responses
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_attempt  public.attempts;
  v_response public.responses;
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_closed' using errcode = 'P0001';
  end if;
  -- 5 s of grace for the network (docs/08-mode-exam.md).
  if v_attempt.deadline is not null and now() > v_attempt.deadline + interval '5 seconds' then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;
  if not (p_question_id = any (v_attempt.question_ids)) then
    raise exception 'unknown_question' using errcode = 'P0001';
  end if;

  if not p_allow_change and exists (
    select 1 from public.responses where attempt_id = p_attempt_id and question_id = p_question_id
  ) then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  insert into public.responses as r
    (attempt_id, question_id, answer, correct, total, points, time_ms)
  values (p_attempt_id, p_question_id, p_answer, p_correct, p_total, p_points, p_time_ms)
  on conflict (attempt_id, question_id) do update
     set answer      = excluded.answer,
         correct     = excluded.correct,
         total       = excluded.total,
         points      = excluded.points,
         time_ms     = excluded.time_ms,
         answered_at = now()
  returning * into v_response;
  return v_response;
end;
$$;

-- Close an attempt and total its score. Idempotent: submitting twice returns
-- the already-submitted attempt.
create function public.submit_attempt(
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
begin
  select * into v_attempt from public.attempts where id = p_attempt_id for update;
  if not found then
    raise exception 'attempt_not_found' using errcode = 'P0002';
  end if;
  if v_attempt.status = 'submitted' then
    return v_attempt;
  end if;
  if v_attempt.status <> 'in_progress' then
    raise exception 'attempt_closed' using errcode = 'P0001';
  end if;

  update public.attempts a
     set status       = 'submitted',
         submitted_at = now(),
         score        = coalesce((select sum(points) from public.responses where attempt_id = a.id), 0),
         max_score    = p_max_score,
         xp           = p_xp,
         max_streak   = p_max_streak
   where a.id = p_attempt_id
  returning * into v_attempt;

  update public.participants set last_seen_at = now() where id = v_attempt.participant_id;
  return v_attempt;
end;
$$;

-- ensure_practice_session runs as the host, so hosts need the (harmless) code generator.
revoke all on function public.generate_session_code() from public, anon;
grant execute on function public.generate_session_code() to authenticated, service_role;
revoke all on function public.ensure_practice_session(uuid, jsonb) from public, anon;
grant execute on function public.ensure_practice_session(uuid, jsonb) to authenticated;

revoke all on function public.join_session(uuid, text, text) from public, anon, authenticated;
revoke all on function public.start_attempt(uuid, uuid, bigint, uuid[], int, int) from public, anon, authenticated;
revoke all on function public.record_response(uuid, uuid, jsonb, numeric, numeric, int, int, boolean) from public, anon, authenticated;
revoke all on function public.submit_attempt(uuid, numeric, int, int) from public, anon, authenticated;
grant execute on function public.join_session(uuid, text, text) to service_role;
grant execute on function public.start_attempt(uuid, uuid, bigint, uuid[], int, int) to service_role;
grant execute on function public.record_response(uuid, uuid, jsonb, numeric, numeric, int, int, boolean) to service_role;
grant execute on function public.submit_attempt(uuid, numeric, int, int) to service_role;

-- The service role works on behalf of verified participants.
grant select, insert, update, delete on public.sessions, public.participants, public.attempts,
  public.responses, public.quiz_embed_secrets to service_role;
grant select on public.quizzes, public.quiz_versions to service_role;
