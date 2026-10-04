-- P8-07 · Read-only REST API for results (docs/02-architecture.md#api-rest).
--
-- A host (one account = one workspace) creates API tokens on /account/integrations. Only a
-- SHA-256 hash is stored; the token itself is shown once. /api/v1/* hashes the bearer token,
-- asks api_authenticate() whose it is, and reads through the api_* functions below. Those
-- take the owner explicitly and filter on it themselves, so the service-role caller can't
-- accidentally read someone else's quiz.

create table public.api_tokens (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 60),
  -- First characters of the token, so people can tell their tokens apart.
  prefix       text not null check (char_length(prefix) between 4 and 24),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz,
  last_used_at timestamptz,
  revoked_at   timestamptz
);

create index api_tokens_owner_idx on public.api_tokens (owner_id, created_at desc);

alter table public.api_tokens enable row level security;

create policy "api_tokens: owner reads" on public.api_tokens
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "api_tokens: owner creates" on public.api_tokens
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "api_tokens: owner revokes" on public.api_tokens
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "api_tokens: owner deletes" on public.api_tokens
  for delete to authenticated using (owner_id = (select auth.uid()));

revoke all on public.api_tokens from anon, authenticated;
grant select, insert, delete on public.api_tokens to authenticated;
grant update (revoked_at) on public.api_tokens to authenticated;
grant select, update on public.api_tokens to service_role;

-- ─── Authentication ───────────────────────────────────────────────────────────

-- Owner of a live (not revoked, not expired) token, or null. Touches last_used_at at most
-- once a minute so busy integrations don't write on every request.
create function public.api_authenticate(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
begin
  select t.owner_id into v_owner
    from public.api_tokens t
   where t.token_hash = p_token_hash
     and t.revoked_at is null
     and (t.expires_at is null or t.expires_at > now());
  if v_owner is not null then
    update public.api_tokens t
       set last_used_at = now()
     where t.token_hash = p_token_hash
       and (t.last_used_at is null or t.last_used_at < now() - interval '1 minute');
  end if;
  return v_owner;
end;
$$;

-- ─── Reads ────────────────────────────────────────────────────────────────────

-- Every quiz of the owner, newest change first.
create function public.api_quizzes(p_owner uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(to_jsonb(r) order by r.updated_at desc, r.id), '[]'::jsonb)
    from (
      select q.id, q.title, q.description, q.slug, q.visibility, q.latest_version,
             (select count(*) from public.questions qs where qs.quiz_id = q.id) as question_count,
             q.created_at, q.updated_at
        from public.quizzes q
       where q.owner_id = p_owner
       order by q.updated_at desc, q.id
       limit 1000
    ) r
$$;

-- One quiz: its sessions and the questions of its latest published version (no answer keys).
create function public.api_quiz(p_owner uuid, p_quiz_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'title', q.title,
    'description', q.description,
    'slug', q.slug,
    'visibility', q.visibility,
    'latest_version', q.latest_version,
    'created_at', q.created_at,
    'updated_at', q.updated_at,
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', item ->> 'id',
               'position', ord - 1,
               'type', item ->> 'type',
               'prompt', item ->> 'prompt',
               'points', (item ->> 'points')::int
             ) order by ord)
        from public.quiz_versions v,
             jsonb_array_elements(v.snapshot -> 'questions') with ordinality as t(item, ord)
       where v.quiz_id = q.id and v.version = q.latest_version
    ), '[]'::jsonb),
    'sessions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id,
               'mode', s.mode,
               'title', s.title,
               'status', s.status,
               'code', s.code,
               'is_default', s.is_default,
               'opens_at', s.opens_at,
               'closes_at', s.closes_at,
               'created_at', s.created_at,
               'participants', (select count(*) from public.participants p where p.session_id = s.id)
             ) order by s.created_at desc)
        from public.sessions s
       where s.quiz_id = q.id
    ), '[]'::jsonb)
  )
    from public.quizzes q
   where q.id = p_quiz_id and q.owner_id = p_owner
$$;

-- A page of a quiz's attempts, oldest first (so a sync can keep going from the cursor).
-- Cursor = the last row's (started_at, id).
create function public.api_attempts(
  p_owner         uuid,
  p_quiz_id       uuid,
  p_session_id    uuid default null,
  p_status        public.attempt_status default null,
  p_since         timestamptz default null,
  p_after_started timestamptz default null,
  p_after_id      uuid default null,
  p_limit         int default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_rows jsonb;
  v_last jsonb;
begin
  if not exists (select 1 from public.quizzes q where q.id = p_quiz_id and q.owner_id = p_owner) then
    return null;
  end if;

  with page as (
    select a.id, a.session_id, s.mode, a.attempt_no, a.status, a.score, a.max_score,
           case when a.max_score > 0 then round(a.score / a.max_score, 4) end as ratio,
           a.started_at, a.submitted_at,
           jsonb_build_object(
             'id', p.id, 'nickname', p.nickname, 'external_id', p.external_id,
             'user_id', p.user_id
           ) as participant
      from public.attempts a
      join public.sessions s on s.id = a.session_id
      join public.participants p on p.id = a.participant_id
     where s.quiz_id = p_quiz_id
       and (p_session_id is null or a.session_id = p_session_id)
       and (p_status is null or a.status = p_status)
       and (p_since is null or a.started_at >= p_since)
       and (p_after_started is null
            or a.started_at > p_after_started
            or (a.started_at = p_after_started and a.id > p_after_id))
     order by a.started_at, a.id
     limit v_limit + 1
  )
  select coalesce(jsonb_agg(to_jsonb(page) order by started_at, id), '[]'::jsonb)
    into v_rows
    from page;

  if jsonb_array_length(v_rows) > v_limit then
    v_rows := v_rows - v_limit;  -- drop the lookahead row
    v_last := v_rows -> (v_limit - 1);
    return jsonb_build_object(
      'data', v_rows,
      'next', jsonb_build_object('started_at', v_last -> 'started_at', 'id', v_last -> 'id')
    );
  end if;
  return jsonb_build_object('data', v_rows, 'next', null);
end;
$$;

-- One attempt with its answers, question text from the version it was played on.
create function public.api_attempt(p_owner uuid, p_attempt_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id,
    'quiz_id', s.quiz_id,
    'session_id', a.session_id,
    'mode', s.mode,
    'attempt_no', a.attempt_no,
    'status', a.status,
    'score', a.score,
    'max_score', a.max_score,
    'ratio', case when a.max_score > 0 then round(a.score / a.max_score, 4) end,
    'started_at', a.started_at,
    'submitted_at', a.submitted_at,
    'participant', jsonb_build_object(
      'id', p.id, 'nickname', p.nickname, 'external_id', p.external_id, 'user_id', p.user_id
    ),
    'responses', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_id', r.question_id,
               'type', item ->> 'type',
               'prompt', item ->> 'prompt',
               'answer', r.answer,
               'correct', r.correct,
               'total', r.total,
               'points', r.points,
               'time_ms', r.time_ms,
               'answered_at', r.answered_at,
               'feedback', r.feedback
             ) order by coalesce(array_position(a.question_ids, r.question_id), 2147483647),
                        r.answered_at)
        from public.responses r
        left join lateral (
          select item
            from jsonb_array_elements(v.snapshot -> 'questions') item
           where item ->> 'id' = r.question_id::text
           limit 1
        ) snap on true
       where r.attempt_id = a.id
    ), '[]'::jsonb)
  )
    from public.attempts a
    join public.sessions s on s.id = a.session_id
    join public.quizzes q on q.id = s.quiz_id
    join public.participants p on p.id = a.participant_id
    join public.quiz_versions v on v.id = a.quiz_version_id
   where a.id = p_attempt_id and q.owner_id = p_owner
$$;

revoke all on function public.api_authenticate(text) from public, anon, authenticated;
revoke all on function public.api_quizzes(uuid) from public, anon, authenticated;
revoke all on function public.api_quiz(uuid, uuid) from public, anon, authenticated;
revoke all on function public.api_attempts(uuid, uuid, uuid, public.attempt_status, timestamptz, timestamptz, uuid, int)
  from public, anon, authenticated;
revoke all on function public.api_attempt(uuid, uuid) from public, anon, authenticated;
grant execute on function public.api_authenticate(text) to service_role;
grant execute on function public.api_quizzes(uuid) to service_role;
grant execute on function public.api_quiz(uuid, uuid) to service_role;
grant execute on function public.api_attempts(uuid, uuid, uuid, public.attempt_status, timestamptz, timestamptz, uuid, int)
  to service_role;
grant execute on function public.api_attempt(uuid, uuid) to service_role;
