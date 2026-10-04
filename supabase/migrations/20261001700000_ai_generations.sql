-- P8-10 · Generate soal dengan AI: one row per generation, for the per-host daily limit and
-- to see what the feature costs (docs/04-question-types.md#generate-soal-dengan-ai).
-- Hosts can add rows and read their own, never delete them (so the limit can't be reset).

create table public.ai_generations (
  id             uuid primary key default gen_random_uuid(),
  owner_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  source         text not null check (source in ('topic', 'text', 'pdf')),
  model          text not null,
  question_count int not null default 0,
  input_tokens   int,
  output_tokens  int,
  created_at     timestamptz not null default now()
);

create index ai_generations_owner_idx on public.ai_generations (owner_id, created_at desc);

alter table public.ai_generations enable row level security;

create policy "ai_generations: owner reads" on public.ai_generations
  for select to authenticated using (owner_id = (select auth.uid()));
create policy "ai_generations: owner logs" on public.ai_generations
  for insert to authenticated with check (owner_id = (select auth.uid()));

revoke all on public.ai_generations from anon, authenticated;
grant select, insert on public.ai_generations to authenticated;
grant select on public.ai_generations to service_role;
