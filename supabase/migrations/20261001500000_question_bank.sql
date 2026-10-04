-- P8-12 · Question bank across quizzes (docs/04-question-types.md#bank-soal).
--
-- A host searches the questions of all their quizzes (RLS: only their own) by text, type
-- and tag, and copies them into the quiz they're editing. Tags are one vocabulary per host,
-- so the editor suggests the tags already in use.

create index questions_tags_idx on public.questions using gin (tags);

-- The caller's tags with how many questions use each, most used first.
create function public.my_question_tags()
returns table (tag text, uses bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.tag, count(*) as uses
    from public.questions q
    join public.quizzes z on z.id = q.quiz_id
   cross join lateral unnest(q.tags) as t(tag)
   where z.owner_id = (select auth.uid())
   group by t.tag
   order by uses desc, t.tag
   limit 500
$$;

revoke all on function public.my_question_tags() from public, anon;
grant execute on function public.my_question_tags() to authenticated;
