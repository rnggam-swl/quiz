-- P8-08 · LTI 1.3 (Moodle, Canvas, …) with deep linking and grades to the gradebook (AGS).
-- docs/07-embed.md#lti-13
--
-- A teacher registers their LMS ("platform") on /account/integrations. Launches arrive at
-- /api/lti/login → the LMS → /api/lti/launch, where the id_token is checked against the
-- platform's keys. Learners then play the quiz like an embed with a server-made identity,
-- and the score of a finished attempt goes back to the LMS gradebook.
-- Everything but the platform list is for the service role only.

create table public.lti_platforms (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 80),
  issuer         text not null check (issuer ~ '^https://' and char_length(issuer) <= 300),
  client_id      text not null check (char_length(client_id) between 1 and 300),
  auth_login_url text not null check (auth_login_url ~ '^https://' and char_length(auth_login_url) <= 500),
  auth_token_url text not null check (auth_token_url ~ '^https://' and char_length(auth_token_url) <= 500),
  jwks_url       text not null check (jwks_url ~ '^https://' and char_length(jwks_url) <= 500),
  -- Empty = accept any deployment of this client (the first one seen is fine for most LMSs).
  deployment_ids text[] not null default '{}',
  created_at     timestamptz not null default now(),
  unique (issuer, client_id)
);

alter table public.lti_platforms enable row level security;
create policy "lti_platforms: owner reads" on public.lti_platforms
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "lti_platforms: owner adds" on public.lti_platforms
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "lti_platforms: owner deletes" on public.lti_platforms
  for delete to authenticated using (owner_id = (select auth.uid()));
revoke all on public.lti_platforms from anon, authenticated;
grant select, insert, delete on public.lti_platforms to authenticated;
grant select on public.lti_platforms to service_role;

-- The tool's own RSA key (JWKS, deep-linking responses, AGS client assertions). Made on
-- first use by the app; the private key never leaves the service role.
create table public.lti_keys (
  kid         text primary key,
  public_jwk  jsonb not null,
  private_pem text not null,
  created_at  timestamptz not null default now()
);

-- OIDC login state: one use, ten minutes. Kept here rather than in a cookie, because the
-- LMS usually frames the tool and third-party cookies are often blocked there.
create table public.lti_states (
  state       text primary key,
  nonce       text not null,
  platform_id uuid not null references public.lti_platforms (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- A verified launch: who, from where, which quiz, and where their grade goes.
create table public.lti_launches (
  id                   uuid primary key default gen_random_uuid(),
  platform_id          uuid not null references public.lti_platforms (id) on delete cascade,
  deployment_id        text not null,
  message_type         text not null check (message_type in ('LtiResourceLinkRequest', 'LtiDeepLinkingRequest')),
  lti_user_id          text not null,
  -- participants.external_id of the learner (lti:<platform>:<sub>)
  external_id          text not null,
  name                 text,
  resource_link_id     text,
  quiz_id              uuid references public.quizzes (id) on delete cascade,
  lineitem             text,
  deep_link_return_url text,
  deep_link_data       text,
  created_at           timestamptz not null default now()
);

create index lti_launches_grade_idx on public.lti_launches (external_id, quiz_id, created_at desc);

alter table public.lti_keys     enable row level security;
alter table public.lti_states   enable row level security;
alter table public.lti_launches enable row level security;
revoke all on public.lti_keys, public.lti_states, public.lti_launches from anon, authenticated;
grant select, insert, update, delete on public.lti_keys, public.lti_states, public.lti_launches
  to service_role;

-- The quiz's standing practice session, made if needed with the quiz owner as host (a
-- launch comes from the LMS, not from a signed-in teacher).
create function public.lti_practice_session(p_quiz_id uuid)
returns public.sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session public.sessions;
  v_owner   uuid;
begin
  select * into v_session from public.sessions where quiz_id = p_quiz_id and is_default;
  if found then
    return v_session;
  end if;
  select owner_id into v_owner from public.quizzes
   where id = p_quiz_id and latest_version is not null;
  if v_owner is null then
    raise exception 'not_published' using errcode = 'P0001';
  end if;
  for i in 1..5 loop
    begin
      insert into public.sessions (quiz_id, host_id, mode, policy, code, is_default)
      values (p_quiz_id, v_owner, 'practice', '{}', public.generate_session_code(), true)
      returning * into v_session;
      return v_session;
    exception when unique_violation then
      select * into v_session from public.sessions where quiz_id = p_quiz_id and is_default;
      if found then
        return v_session;
      end if;
    end;
  end loop;
  raise exception 'no_free_code' using errcode = 'P0001';
end;
$$;

revoke all on function public.lti_practice_session(uuid) from public, anon, authenticated;
grant execute on function public.lti_practice_session(uuid) to service_role;

-- Old login states go away daily (they only live ten minutes anyway).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule(
      'prune-lti-states', '29 4 * * *',
      $job$delete from public.lti_states where created_at < now() - interval '1 hour'$job$
    );
  end if;
end;
$$;
