-- P8-06 · Webhooks: attempt.submitted, HMAC-signed, logged and retried
-- (docs/07-embed.md#webhook).
--
-- Outbox pattern: when an attempt is submitted (or expires), a trigger writes one row per
-- subscribed webhook into webhook_deliveries, in the same transaction. The app sends them
-- (src/lib/webhooks/dispatch.ts): right after the Server Action that submitted, and for
-- retries whenever /api/webhooks/dispatch runs (pg_cron pings it each minute when the app
-- URL is in Vault). Sending from the app, not from Postgres (pg_net), keeps webhook URLs
-- away from the database's own network.

create table public.webhooks (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  url         text not null check (url ~ '^https?://' and char_length(url) <= 500),
  -- Standard Webhooks secret (whsec_ + base64). Kept readable: it signs every delivery.
  secret      text not null check (secret ~ '^whsec_[A-Za-z0-9+/=]{32,}$'),
  events      text[] not null default '{attempt.submitted}'
              check (cardinality(events) > 0 and events <@ array['attempt.submitted']),
  description text not null default '' check (char_length(description) <= 100),
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index webhooks_owner_idx on public.webhooks (owner_id);

create trigger webhooks_set_updated_at
  before update on public.webhooks
  for each row execute function public.set_updated_at();

create table public.webhook_deliveries (
  id              uuid primary key default gen_random_uuid(),
  webhook_id      uuid not null references public.webhooks (id) on delete cascade,
  -- Same id on every retry (webhook-id header), so receivers can ignore duplicates.
  event_id        uuid not null,
  event           text not null check (event in ('attempt.submitted', 'webhook.test')),
  payload         jsonb not null,
  status          text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_until    timestamptz,
  response_status int,
  response_body   text,
  last_error      text,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  unique (webhook_id, event_id)
);

create index webhook_deliveries_due_idx on public.webhook_deliveries (next_attempt_at)
  where status = 'pending';
create index webhook_deliveries_webhook_idx on public.webhook_deliveries (webhook_id, created_at desc);

alter table public.webhooks           enable row level security;
alter table public.webhook_deliveries enable row level security;

create policy "webhooks: owner reads" on public.webhooks
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "webhooks: owner creates" on public.webhooks
  for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "webhooks: owner updates" on public.webhooks
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "webhooks: owner deletes" on public.webhooks
  for delete to authenticated using (owner_id = (select auth.uid()));

create policy "webhook_deliveries: owner reads" on public.webhook_deliveries
  for select to authenticated using (
    exists (select 1 from public.webhooks w
             where w.id = webhook_id and w.owner_id = (select auth.uid()))
  );

revoke all on public.webhooks, public.webhook_deliveries from anon, authenticated;
grant select, insert, delete on public.webhooks to authenticated;
grant update (url, description, events, active, secret) on public.webhooks to authenticated;
grant select on public.webhook_deliveries to authenticated;
grant select on public.webhooks to service_role;
grant select, insert, update, delete on public.webhook_deliveries to service_role;

-- ─── Events ───────────────────────────────────────────────────────────────────

-- The attempt.submitted body: what a gradebook needs, no answers (fetch those with the API).
create function public.webhook_attempt_payload(p_attempt_id uuid, p_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', p_event_id,
    'type', 'attempt.submitted',
    'created_at', now(),
    'data', jsonb_build_object(
      'attempt', jsonb_build_object(
        'id', a.id,
        'attempt_no', a.attempt_no,
        'status', a.status,
        'score', a.score,
        'max_score', a.max_score,
        'ratio', case when a.max_score > 0 then round(a.score / a.max_score, 4) end,
        'started_at', a.started_at,
        'submitted_at', a.submitted_at
      ),
      'participant', jsonb_build_object(
        'id', p.id, 'nickname', p.nickname, 'external_id', p.external_id, 'user_id', p.user_id
      ),
      'session', jsonb_build_object('id', s.id, 'mode', s.mode, 'title', s.title),
      'quiz', jsonb_build_object('id', q.id, 'title', q.title, 'slug', q.slug, 'version', v.version)
    )
  )
    from public.attempts a
    join public.sessions s on s.id = a.session_id
    join public.quizzes q on q.id = s.quiz_id
    join public.participants p on p.id = a.participant_id
    join public.quiz_versions v on v.id = a.quiz_version_id
   where a.id = p_attempt_id
$$;

create function public.enqueue_attempt_webhooks()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_event uuid := gen_random_uuid();
begin
  select q.owner_id into v_owner
    from public.sessions s
    join public.quizzes q on q.id = s.quiz_id
   where s.id = new.session_id;

  if exists (select 1 from public.webhooks w
              where w.owner_id = v_owner and w.active and 'attempt.submitted' = any (w.events)) then
    insert into public.webhook_deliveries (webhook_id, event_id, event, payload)
    select w.id, v_event, 'attempt.submitted', public.webhook_attempt_payload(new.id, v_event)
      from public.webhooks w
     where w.owner_id = v_owner and w.active and 'attempt.submitted' = any (w.events);
  end if;
  return new;
end;
$$;

-- Fires once per finish: in_progress → submitted/expired (reopen + resubmit is a new event).
create trigger attempts_enqueue_webhooks
  after update of status on public.attempts
  for each row
  when (old.status = 'in_progress' and new.status in ('submitted', 'expired'))
  execute function public.enqueue_attempt_webhooks();

-- ─── Host actions ─────────────────────────────────────────────────────────────

-- "Kirim tes": a webhook.test delivery to one of the caller's webhooks.
create function public.send_test_webhook(p_webhook_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event uuid := gen_random_uuid();
begin
  if not exists (select 1 from public.webhooks w
                  where w.id = p_webhook_id and w.owner_id = (select auth.uid())) then
    raise exception 'webhook_not_found' using errcode = 'P0002';
  end if;
  insert into public.webhook_deliveries (webhook_id, event_id, event, payload)
  values (
    p_webhook_id, v_event, 'webhook.test',
    jsonb_build_object('id', v_event, 'type', 'webhook.test', 'created_at', now(),
                       'data', jsonb_build_object('webhook_id', p_webhook_id))
  );
  return v_event;
end;
$$;

-- "Kirim ulang": send a delivery again now (one more try, even after it failed).
create function public.redeliver_webhook(p_delivery_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.webhook_deliveries d
     set status = 'pending', next_attempt_at = now(), locked_until = null
    from public.webhooks w
   where d.id = p_delivery_id and w.id = d.webhook_id and w.owner_id = (select auth.uid());
  if not found then
    raise exception 'delivery_not_found' using errcode = 'P0002';
  end if;
end;
$$;

-- ─── Sending (service role) ───────────────────────────────────────────────────

-- Lock up to p_limit due deliveries for two minutes and count the try. Concurrent
-- dispatchers skip each other's rows.
create function public.claim_webhook_deliveries(p_limit int default 20)
returns table (
  id uuid, event_id uuid, event text, payload jsonb, attempts int, url text, secret text
)
language sql
security definer
set search_path = ''
as $$
  with due as (
    select d.id
      from public.webhook_deliveries d
      join public.webhooks w on w.id = d.webhook_id and w.active
     where d.status = 'pending'
       and d.next_attempt_at <= now()
       and (d.locked_until is null or d.locked_until < now())
     order by d.next_attempt_at
     limit least(greatest(coalesce(p_limit, 20), 1), 50)
       for update of d skip locked
  )
  update public.webhook_deliveries d
     set locked_until = now() + interval '2 minutes',
         attempts = d.attempts + 1
    from due, public.webhooks w
   where d.id = due.id and w.id = d.webhook_id
  returning d.id, d.event_id, d.event, d.payload, d.attempts, w.url, w.secret
$$;

-- Record the result. Failed tries wait 1 min, 5 min, 30 min, 2 h, 6 h, 12 h; after the
-- 7th the delivery is marked failed (it can still be sent again by hand).
create function public.finish_webhook_delivery(
  p_delivery_id uuid,
  p_ok          boolean,
  p_status      int default null,
  p_body        text default null,
  p_error       text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.webhook_deliveries d
     set status = case when p_ok then 'succeeded'
                       when d.attempts >= 7 then 'failed'
                       else 'pending' end,
         delivered_at = case when p_ok then now() end,
         next_attempt_at = case
           when p_ok or d.attempts >= 7 then d.next_attempt_at
           else now() + (array[interval '1 minute', interval '5 minutes', interval '30 minutes',
                               interval '2 hours', interval '6 hours', interval '12 hours'])
                         [least(greatest(d.attempts, 1), 6)]
         end,
         locked_until = null,
         response_status = p_status,
         response_body = left(p_body, 500),
         last_error = left(p_error, 500)
   where d.id = p_delivery_id
$$;

-- Ask the app to run a job: POST {app}{path} with the cron secret. Both live in Vault
-- (docs/07-embed.md#webhook); without them this does nothing. Only ever calls our own app.
create function public.call_app(p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'quiz_app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'quiz_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || p_path,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  );
end;
$$;

-- pg_cron (each minute): if something is due, ask the app to send it. Without the Vault
-- secrets, retries go out the next time the app dispatches.
create function public.ping_webhook_dispatcher()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.webhook_deliveries d
              where d.status = 'pending' and d.next_attempt_at <= now()
                and (d.locked_until is null or d.locked_until < now())) then
    perform public.call_app('/api/webhooks/dispatch');
  end if;
end;
$$;

revoke all on function public.webhook_attempt_payload(uuid, uuid) from public, anon, authenticated;
revoke all on function public.enqueue_attempt_webhooks() from public, anon, authenticated;
revoke all on function public.send_test_webhook(uuid) from public, anon;
revoke all on function public.redeliver_webhook(uuid) from public, anon;
revoke all on function public.claim_webhook_deliveries(int) from public, anon, authenticated;
revoke all on function public.finish_webhook_delivery(uuid, boolean, int, text, text)
  from public, anon, authenticated;
revoke all on function public.ping_webhook_dispatcher() from public, anon, authenticated;
revoke all on function public.call_app(text) from public, anon, authenticated;
grant execute on function public.send_test_webhook(uuid) to authenticated;
grant execute on function public.redeliver_webhook(uuid) to authenticated;
grant execute on function public.claim_webhook_deliveries(int) to service_role;
grant execute on function public.finish_webhook_delivery(uuid, boolean, int, text, text) to service_role;

-- ─── Schedule (Supabase has pg_cron and pg_net; test databases don't) ─────────

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron with schema pg_catalog;
    perform cron.schedule('dispatch-webhooks', '* * * * *', 'select public.ping_webhook_dispatcher()');
    perform cron.schedule(
      'prune-webhook-deliveries', '17 3 * * *',
      $job$delete from public.webhook_deliveries where created_at < now() - interval '30 days'$job$
    );
  end if;
end;
$$;
