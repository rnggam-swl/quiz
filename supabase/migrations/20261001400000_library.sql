-- P8-11 · Public quiz library (docs/01-product.md#library).
--
-- quizzes.visibility: 'public' = listed in /library; 'unlisted' = only people with the link
-- can view and copy it; 'private' (default) = only the owner. The library always shows
-- the latest *published* version, never the draft, and never answer keys (the preview has
-- prompts only). Copying gives the copier the full questions, keys included: that is the
-- point of sharing, and the owner is warned when going public.

alter table public.quizzes
  add column copied_from uuid references public.quizzes (id) on delete set null;

create index quizzes_copied_from_idx on public.quizzes (copied_from) where copied_from is not null;
create index quizzes_library_idx on public.quizzes (updated_at desc)
  where visibility = 'public' and latest_version is not null;

-- Search the library (anyone, signed in or not). Most-copied first, then newest.
create function public.library_quizzes(
  p_query  text default null,
  p_limit  int default 24,
  p_offset int default 0
)
returns table (
  id uuid, title text, description text, cover_url text, theme jsonb, question_count int,
  author text, published_at timestamptz, copies bigint, total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with published as (
    select q.id, v.snapshot, v.published_at, p.display_name,
           (select count(*) from public.quizzes c where c.copied_from = q.id) as copies
      from public.quizzes q
      join public.quiz_versions v on v.quiz_id = q.id and v.version = q.latest_version
      join public.profiles p on p.id = q.owner_id
     where q.visibility = 'public'
       and (coalesce(btrim(p_query), '') = ''
            or strpos(lower(v.snapshot #>> '{quiz,title}'), lower(btrim(p_query))) > 0
            or strpos(lower(v.snapshot #>> '{quiz,description}'), lower(btrim(p_query))) > 0)
  )
  select pb.id,
         pb.snapshot #>> '{quiz,title}',
         pb.snapshot #>> '{quiz,description}',
         pb.snapshot #>> '{quiz,cover_url}',
         coalesce(pb.snapshot #> '{quiz,theme}', '{}'::jsonb),
         jsonb_array_length(pb.snapshot -> 'questions'),
         pb.display_name,
         pb.published_at,
         pb.copies,
         count(*) over ()
    from published pb
   order by pb.copies desc, pb.published_at desc, pb.id
   limit least(greatest(coalesce(p_limit, 24), 1), 60)
  offset greatest(coalesce(p_offset, 0), 0)
$$;

-- One library quiz for its preview page: prompts and types, no answers or explanations.
create function public.library_quiz(p_quiz_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', q.id,
    'visibility', q.visibility,
    'title', v.snapshot #>> '{quiz,title}',
    'description', v.snapshot #>> '{quiz,description}',
    'cover_url', v.snapshot #>> '{quiz,cover_url}',
    'theme', coalesce(v.snapshot #> '{quiz,theme}', '{}'::jsonb),
    'author', p.display_name,
    'version', v.version,
    'published_at', v.published_at,
    'copies', (select count(*) from public.quizzes c where c.copied_from = q.id),
    'practice_code', (select s.code from public.sessions s
                       where s.quiz_id = q.id and s.is_default and s.status in ('lobby', 'running')),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'type', item ->> 'type',
               'prompt', item ->> 'prompt',
               'points', (item ->> 'points')::int,
               'image', (select m ->> 'url' from jsonb_array_elements(item -> 'media') m
                          where m ->> 'kind' = 'image' limit 1)
             ) order by ord)
        from jsonb_array_elements(v.snapshot -> 'questions') with ordinality as t(item, ord)
    ), '[]'::jsonb)
  )
    from public.quizzes q
    join public.quiz_versions v on v.quiz_id = q.id and v.version = q.latest_version
    join public.profiles p on p.id = q.owner_id
   where q.id = p_quiz_id and q.visibility in ('public', 'unlisted')
$$;

-- "Salin ke quiz saya": a private draft for the caller from the latest published version
-- (their own quiz, or a public/unlisted one). New question ids; media keeps pointing at the
-- original files, which orphan_media() then keeps.
create function public.copy_library_quiz(p_quiz_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_snapshot jsonb;
  v_new      uuid;
begin
  if v_uid is null or not exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;

  select v.snapshot into v_snapshot
    from public.quizzes q
    join public.quiz_versions v on v.quiz_id = q.id and v.version = q.latest_version
   where q.id = p_quiz_id and (q.visibility in ('public', 'unlisted') or q.owner_id = v_uid);
  if v_snapshot is null then
    raise exception 'quiz_not_found' using errcode = 'P0002';
  end if;

  insert into public.quizzes (owner_id, title, description, cover_url, theme, copied_from)
  values (
    v_uid,
    coalesce(v_snapshot #>> '{quiz,title}', ''),
    coalesce(v_snapshot #>> '{quiz,description}', ''),
    v_snapshot #>> '{quiz,cover_url}',
    coalesce(v_snapshot #> '{quiz,theme}', '{}'::jsonb),
    p_quiz_id
  )
  returning id into v_new;

  insert into public.questions
    (id, quiz_id, position, type, prompt, help, media, config, time_limit_s, points, explanation, tags)
  select gen_random_uuid(),
         v_new,
         (t.ord - 1)::int,
         e ->> 'type',
         coalesce(e ->> 'prompt', ''),
         coalesce(e ->> 'help', ''),
         coalesce(e -> 'media', '[]'),
         e -> 'config',
         (e ->> 'time_limit_s')::int,
         coalesce((e ->> 'points')::int, 1000),
         coalesce(e ->> 'explanation', ''),
         coalesce(array(select jsonb_array_elements_text(e -> 'tags')), '{}')
    from jsonb_array_elements(v_snapshot -> 'questions') with ordinality as t(e, ord);

  return v_new;
end;
$$;

revoke all on function public.library_quizzes(text, int, int) from public;
revoke all on function public.library_quiz(uuid) from public;
revoke all on function public.copy_library_quiz(uuid) from public, anon;
grant execute on function public.library_quizzes(text, int, int) to anon, authenticated;
grant execute on function public.library_quiz(uuid) to anon, authenticated;
grant execute on function public.copy_library_quiz(uuid) to authenticated;
