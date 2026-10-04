-- P8-15 · Orphaned files in the quiz-media bucket (docs/03-data-model.md#konten).
--
-- Files stay in Storage when a quiz is deleted, and removing media in the editor only edits
-- the question JSON. A file is still in use while any quiz cover, draft question (media or
-- item media inside config) or published snapshot mentions its public URL, including other
-- quizzes' copies. Everything else older than a day (uploads the editor hasn't saved yet
-- are younger) is an orphan. The app deletes them through the Storage API
-- (/api/maintenance/media-cleanup); Postgres only finds them.

create function public.orphan_media(
  p_min_age interval default interval '1 day',
  p_limit   int default 1000
)
returns table (name text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with sources as (
    select q.cover_url as body from public.quizzes q where q.cover_url is not null
    union all
    select qs.media::text || ' ' || qs.config::text from public.questions qs
    union all
    select v.snapshot::text from public.quiz_versions v
  ),
  refs as (
    select distinct m.parts[1] as name
      from sources s
     cross join lateral regexp_matches(
       s.body, '/storage/v1/object/public/quiz-media/([A-Za-z0-9._/-]+)', 'g'
     ) as m(parts)
  )
  select o.name, o.created_at
    from storage.objects o
   where o.bucket_id = 'quiz-media'
     and o.created_at < now() - p_min_age
     and not exists (select 1 from refs r where r.name = o.name)
   order by o.created_at
   limit least(greatest(coalesce(p_limit, 1000), 1), 5000)
$$;

revoke all on function public.orphan_media(interval, int) from public, anon, authenticated;
grant execute on function public.orphan_media(interval, int) to service_role;

-- Daily, when pg_cron and the Vault secrets are there (see call_app).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_available_extensions where name = 'pg_net') then
    perform cron.schedule(
      'cleanup-quiz-media', '43 2 * * *',
      $job$select public.call_app('/api/maintenance/media-cleanup')$job$
    );
  end if;
end;
$$;
