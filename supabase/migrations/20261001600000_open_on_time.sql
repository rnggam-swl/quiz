-- P8-03 · Buka serentak (docs/09-mode-live.md#buka-serentak).
--
-- The question travels with the countdown state, and every screen shows it at the end of
-- the countdown by the server clock, without waiting for the "open" event. The database
-- follows the same clock: the round counts as opened at the scheduled moment (the
-- countdown's phase_closes_at), not whenever the host's timer call arrives, so speed
-- points start together for everyone. Whoever notices first opens it: the host's "auto"
-- call, or a participant whose early answer found the round still in countdown.

create function public.open_due_round(p_session_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.sessions;
  v_round public.battle_rounds;
begin
  select s.* into v
    from public.sessions s
    join public.quizzes q on q.id = s.quiz_id
   where s.id = p_session_id
     and s.mode in ('live', 'battle_buzzer', 'battle_royale')
     -- Hosts may only open their own sessions; the service role acts for participants.
     and ((select auth.uid()) is null or q.owner_id = (select auth.uid()))
     for update of s;
  if not found or v.phase is distinct from 'countdown' or v.paused_at is not null
     or v.phase_closes_at is null or now() < v.phase_closes_at then
    return false;
  end if;

  update public.battle_rounds
     set status = 'open',
         opened_at = v.phase_closes_at,
         closes_at = v.phase_closes_at + make_interval(secs => time_limit_ms / 1000.0)
   where session_id = v.id and idx = v.current_round and status = 'countdown'
  returning * into v_round;
  if not found then
    return false;
  end if;

  update public.sessions
     set phase = 'open', phase_opened_at = v_round.opened_at, phase_closes_at = v_round.closes_at,
         state_version = state_version + 1
   where id = v.id;
  return true;
end;
$$;

revoke all on function public.open_due_round(uuid) from public, anon;
grant execute on function public.open_due_round(uuid) to authenticated, service_role;
