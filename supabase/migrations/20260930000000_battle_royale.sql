-- P7 · Battle Royale (docs/10-mode-battle.md#battle-royale). Same engine as live and
-- Rebutan: everyone alive answers every round; when the round locks, resolve_royale_round
-- takes a life from whoever was wrong or silent, and at zero lives they become
-- spectators who keep playing for shadow points. The zone shrinks each round.

alter table public.participants
  add column lives            int check (lives >= 0),
  add column eliminated_round int check (eliminated_round >= 0),
  add column shadow_score     int not null default 0;

-- Spectators' answers count for shadow points only.
alter table public.battle_answers add column shadow boolean not null default false;

-- ─── Round answers with the shadow flag ───────────────────────────────────────

drop function public.round_answers(public.sessions, public.battle_rounds);

create function public.round_answers(p_session public.sessions, p_round public.battle_rounds)
returns table (participant_id uuid, answer jsonb, correct numeric, total numeric,
               points int, time_ms int, shadow boolean)
language sql
stable
security invoker
set search_path = ''
as $$
  select a.participant_id, r.answer, r.correct, r.total, r.points, r.time_ms, false
    from public.responses r join public.attempts a on a.id = r.attempt_id
   where p_session.mode = 'live' and a.session_id = p_session.id
     and r.question_id = p_round.question_id
  union all
  select b.participant_id, b.answer, case when b.correct then 1 else 0 end, 1, b.points,
         b.reaction_ms, b.shadow
    from public.battle_answers b
   where p_session.mode <> 'live' and b.round_id = p_round.id;
$$;

-- ─── Resolving a round ────────────────────────────────────────────────────────

-- When a royale round locks (docs/10 · Aturan, Kasus khusus):
--   - every survivor without a right answer loses a life (sudden death: all of them);
--   - eliminateSlowest: if everyone was right, the slowest loses one, so it can't stall;
--   - at zero lives: eliminated_round = idx, is_spectator = true;
--   - unless that would knock out every survivor at once: then nobody goes, they keep 1.
create function public.resolve_royale_round(p_session public.sessions, p_round public.battle_rounds)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_start   int := greatest(1, coalesce((p_session.policy -> 'royale' ->> 'lives')::int, 3));
  v_slowest boolean := coalesce((p_session.policy -> 'royale' ->> 'eliminateSlowest')::boolean, false);
  v_sudden  boolean := p_round.idx >= coalesce(array_length(p_session.question_ids, 1), 0);
  v_alive   int;
  v_hit     int;
  v_out     int;
  v_slow    uuid;
begin
  select count(*) into v_alive from public.participants
   where session_id = p_session.id and kicked_at is null and not is_spectator;
  if v_alive = 0 then
    return;
  end if;

  update public.participants p
     set lives = case when v_sudden then 0 else greatest(0, coalesce(p.lives, v_start) - 1) end
   where p.session_id = p_session.id and p.kicked_at is null and not p.is_spectator
     and not exists (
       select 1 from public.battle_answers b
        where b.round_id = p_round.id and b.participant_id = p.id and b.correct and not b.shadow);
  get diagnostics v_hit = row_count;

  if v_hit = 0 and v_slowest and v_alive > 1 then
    select b.participant_id into v_slow
      from public.battle_answers b join public.participants p on p.id = b.participant_id
     where b.round_id = p_round.id and b.correct and not b.shadow
       and p.kicked_at is null and not p.is_spectator
     order by b.reaction_ms desc nulls first, b.received_at desc
     limit 1;
    update public.participants set lives = greatest(0, coalesce(lives, v_start) - 1)
     where id = v_slow;
  end if;

  select count(*) into v_out from public.participants
   where session_id = p_session.id and kicked_at is null and not is_spectator and lives = 0;
  if v_out = v_alive then
    -- Everyone would be out in the same round: the round doesn't eliminate anyone.
    update public.participants set lives = 1
     where session_id = p_session.id and kicked_at is null and not is_spectator and lives = 0;
  elsif v_out > 0 then
    update public.participants set is_spectator = true, eliminated_round = p_round.idx
     where session_id = p_session.id and kicked_at is null and not is_spectator and lives = 0;
  end if;
end;
$$;

-- ─── Standings ────────────────────────────────────────────────────────────────

-- Royale ranking: survivors first (more lives first), then the eliminated (later out
-- first); ties go to the faster average right answer, then to who joined first. Late
-- joiners who only watched have no rank.
create function public.royale_standings(p_session_id uuid)
returns table (participant_id uuid, nickname text, alive boolean, lives int,
               eliminated_round int, avg_ms int, score int, shadow_score int,
               watcher boolean, rank int)
language sql
stable
security invoker
set search_path = ''
as $$
  with players as (
    select p.id, p.nickname, not p.is_spectator as alive, coalesce(p.lives, 0) as lives,
           p.eliminated_round, p.score, p.shadow_score, p.joined_at,
           p.is_spectator and p.eliminated_round is null as watcher,
           (select avg(b.reaction_ms)::int from public.battle_answers b
             where b.participant_id = p.id and b.correct and not b.shadow) as avg_ms
      from public.participants p
     where p.session_id = p_session_id and p.kicked_at is null
  )
  select id, nickname, alive, lives, eliminated_round, avg_ms, score, shadow_score, watcher,
         case when watcher then null else
           (row_number() over (partition by watcher
             order by alive desc, lives desc, eliminated_round desc nulls last,
                      avg_ms asc nulls last, joined_at, id))::int
         end
    from players;
$$;

-- ─── Phases (advance_live with the royale rules) ───────────────────────────────

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
  v_royale  boolean;
  v_alive   int := 0;
  v_more    boolean;
  v_shrink  numeric;
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
  -- Battle royale (docs/10): only survivors play on; the game ends when one is left, or
  -- when the questions run out (then sudden death, if the host wants it: the questions
  -- again with 5 seconds and no second chance, at most 10 extra rounds).
  v_royale := v.mode = 'battle_royale';
  if v_royale then
    select count(*) into v_alive from public.participants
     where session_id = v.id and kicked_at is null and not is_spectator;
    v_more := v_alive > 1 and (v.current_round + 1 < v_count
      or (coalesce((v.policy -> 'royale' ->> 'suddenDeath')::boolean, true)
          and v.current_round + 1 < v_count + 10));
  else
    v_more := v.current_round + 1 < v_count;
  end if;

  if v.phase = 'lobby' or (v.phase = 'leaderboard' and v_more) then
    v_next := case when v.phase = 'lobby' then 0 else v.current_round + 1 end;
    if v_count = 0 then
      raise exception 'no_questions' using errcode = 'P0001';
    end if;
    v_limit := public.live_time_limit_ms(v, v.question_ids[(v_next % v_count) + 1]);
    if v_royale then
      if v.phase = 'lobby' then
        update public.participants
           set lives = greatest(1, coalesce((v.policy -> 'royale' ->> 'lives')::int, 3))
         where session_id = v.id and kicked_at is null and not is_spectator;
      end if;
      if v_next >= v_count then
        v_limit := 5000;  -- sudden death
      else
        -- The zone shrinks: every round a little less time, never under 5 seconds.
        v_shrink := least(0.9, greatest(0, coalesce((v.policy -> 'royale' ->> 'shrinkTimerPct')::numeric, 10) / 100));
        v_limit := greatest(5000, round(v_limit * power(1 - v_shrink, v_next)))::int;
      end if;
    end if;
    insert into public.battle_rounds (session_id, idx, question_id, status, time_limit_ms)
    values (v.id, v_next, v.question_ids[(v_next % v_count) + 1], 'countdown', v_limit)
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
    if v_royale then
      perform public.resolve_royale_round(v, v_round);
    end if;
    update public.sessions
       set phase = 'reveal', phase_opened_at = now(), phase_closes_at = now() + interval '5 seconds',
           paused_at = null, paused_remaining_ms = null, state_version = state_version + 1
     where id = v.id
    returning * into v;

  elsif v.phase = 'reveal' and v_royale and v_alive <= 1 then
    -- One survivor left: straight to the podium.
    update public.sessions
       set phase = 'podium', phase_opened_at = now(), phase_closes_at = null,
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

-- ─── Participants: a royale answer (service_role) ─────────────────────────────

-- One answer per round and participant. Survivors earn speed points (as in live) and
-- keep their lives by being right; spectators — eliminated or late — earn shadow points
-- that touch neither lives nor the main ranking. Right or wrong shows at the reveal.
create function public.record_royale_answer(
  p_participant_id uuid,
  p_question_id    uuid,
  p_answer         jsonb,
  p_correct        numeric,
  p_total          numeric,
  p_base_points    int
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
  v_elapsed     int;
  v_ratio       numeric;
  v_points      int;
begin
  select * into v_participant from public.participants where id = p_participant_id;
  if not found then
    raise exception 'participant_not_found' using errcode = 'P0002';
  end if;
  if v_participant.kicked_at is not null then
    raise exception 'kicked' using errcode = 'P0001';
  end if;
  select * into v from public.sessions where id = v_participant.session_id;
  if v.mode is distinct from 'battle_royale' then
    raise exception 'wrong_mode' using errcode = 'P0001';
  end if;
  if v.phase is distinct from 'open' then
    raise exception 'round_closed' using errcode = 'P0001';
  end if;
  select * into v_round from public.battle_rounds where session_id = v.id and idx = v.current_round;
  if not found or v_round.question_id <> p_question_id or v_round.status <> 'open' then
    raise exception 'round_closed' using errcode = 'P0001';
  end if;
  if v_round.closes_at is not null and now() > v_round.closes_at + interval '1 second' then
    raise exception 'deadline_passed' using errcode = 'P0001';
  end if;

  v_elapsed := greatest(0, least(v_round.time_limit_ms,
    (extract(epoch from (coalesce(v.paused_at, now()) - v_round.opened_at)) * 1000)::int));
  v_ratio := case when p_total > 0 then least(1, greatest(0, p_correct / p_total)) else 0 end;
  v_points := round(greatest(0, p_base_points) * v_ratio
                    * (1 - v_elapsed::numeric / v_round.time_limit_ms / 2));

  insert into public.battle_answers
    (round_id, participant_id, answer, correct, points, reaction_ms, shadow)
  values (v_round.id, p_participant_id, p_answer, v_ratio >= 1 and p_total > 0, v_points,
          v_elapsed, v_participant.is_spectator)
  on conflict (round_id, participant_id) do nothing;
  if not found then
    raise exception 'already_answered' using errcode = 'P0001';
  end if;

  if v_participant.is_spectator then
    update public.participants set shadow_score = shadow_score + v_points, last_seen_at = now()
     where id = p_participant_id;
  else
    update public.participants set score = score + v_points, last_seen_at = now()
     where id = p_participant_id;
  end if;
  return jsonb_build_object('accepted', true, 'shadow', v_participant.is_spectator);
end;
$$;

-- ─── State ────────────────────────────────────────────────────────────────────

-- live_state for every mode; royale adds the survivors, this round's eliminations, the
-- zone, lives on the leaderboard and for the participant, and the best spectators.
create or replace function public.live_state(p_session_id uuid, p_participant_id uuid default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v        public.sessions;
  v_round  public.battle_rounds;
  v_state  jsonb;
  v_royale boolean;
begin
  select * into v from public.sessions
   where id = p_session_id and mode in ('live', 'battle_buzzer', 'battle_royale');
  if not found then
    return null;
  end if;
  v_royale := v.mode = 'battle_royale';
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
       where p.kicked_at is null and not ra.shadow)
    end,
    'winner', case when v_round.id is null then null else (
      select jsonb_build_object('id', p.id, 'nickname', p.nickname)
        from public.round_winners w join public.participants p on p.id = w.participant_id
       where w.round_id = v_round.id)
    end,
    'top', case when v.phase not in ('leaderboard', 'podium', 'ended') then '[]'::jsonb
      when v_royale then (
        select coalesce(jsonb_agg(jsonb_build_object(
                 'id', rs.participant_id, 'nickname', rs.nickname, 'score', rs.score,
                 'delta', 0, 'rank', rs.rank, 'prevRank', rs.rank, 'lives', rs.lives,
                 'eliminatedRound', rs.eliminated_round) order by rs.rank), '[]')
          from public.royale_standings(v.id) rs
         where rs.rank <= 5)
      else (
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
    end
  );

  if v_royale then
    v_state := v_state || jsonb_build_object('royale', jsonb_build_object(
      'startLives', greatest(1, coalesce((v.policy -> 'royale' ->> 'lives')::int, 3)),
      'remaining', (select count(*) from public.participants
                     where session_id = v.id and kicked_at is null and not is_spectator),
      'total', (select count(*) from public.participants
                 where session_id = v.id and kicked_at is null
                   and (not is_spectator or eliminated_round is not null)),
      'suddenDeath', v.current_round is not null
                     and v.current_round >= coalesce(array_length(v.question_ids, 1), 0),
      'shrinking', v_round.id is not null
                   and v_round.time_limit_ms < public.live_time_limit_ms(v, v_round.question_id),
      'eliminated', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname)
                                                order by p.nickname), '[]')
                       from public.participants p
                      where p.session_id = v.id and p.kicked_at is null
                        and p.eliminated_round = v.current_round),
      'spectators', case when v.phase in ('podium', 'ended') then (
        select coalesce(jsonb_agg(jsonb_build_object('id', t.participant_id, 'nickname', t.nickname,
                                                     'score', t.shadow_score)
                                  order by t.shadow_score desc, t.nickname), '[]')
          from (select * from public.royale_standings(v.id) rs
                 where not rs.alive and rs.shadow_score > 0
                 order by rs.shadow_score desc, rs.nickname limit 3) t)
      else '[]'::jsonb end
    ));
  end if;

  if p_participant_id is not null then
    v_state := v_state || jsonb_build_object('you', (
      select jsonb_build_object(
               'id', p.id, 'nickname', p.nickname, 'score', p.score, 'streak', p.streak,
               'kicked', p.kicked_at is not null, 'spectator', p.is_spectator,
               'lives', p.lives, 'eliminatedRound', p.eliminated_round,
               'shadowScore', p.shadow_score,
               'rank', case when v_royale then
                   (select rs.rank from public.royale_standings(v.id) rs
                     where rs.participant_id = p.id)
                 else (select count(*) + 1 from public.participants o
                        where o.session_id = v.id and o.kicked_at is null and not o.is_spectator
                          and o.score > p.score)
               end,
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

revoke all on function public.round_answers(public.sessions, public.battle_rounds) from public, anon;
revoke all on function public.resolve_royale_round(public.sessions, public.battle_rounds)
  from public, anon, authenticated;
revoke all on function public.royale_standings(uuid) from public, anon;
revoke all on function public.record_royale_answer(uuid, uuid, jsonb, numeric, numeric, int)
  from public, anon, authenticated;
grant execute on function public.round_answers(public.sessions, public.battle_rounds)
  to authenticated, service_role;
grant execute on function public.royale_standings(uuid) to authenticated, service_role;
grant execute on function public.record_royale_answer(uuid, uuid, jsonb, numeric, numeric, int)
  to service_role;
