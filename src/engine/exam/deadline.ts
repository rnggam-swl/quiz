/**
 * Exam timing. The database sets the real deadline (start_attempt in
 * supabase/migrations/…_exam.sql); these mirror it for previews and the local engine,
 * and turn it into a countdown on a client whose clock may be off.
 */

/** deadline = min(start + duration × (1 + extra%), closes_at); null without either. */
export function examDeadline({
  startedAt,
  durationS,
  extraTimePct = 0,
  closesAt,
}: {
  startedAt: number;
  durationS: number | null | undefined;
  extraTimePct?: number;
  closesAt: number | null | undefined;
}): number | null {
  const byDuration =
    durationS == null ? null : startedAt + Math.round(durationS * (1 + extraTimePct / 100)) * 1000;
  if (byDuration === null) return closesAt ?? null;
  return closesAt == null ? byDuration : Math.min(byDuration, closesAt);
}

/** How far the server clock is ahead of this device, from a timestamp it just sent. */
export function clockOffset(serverNowIso: string, clientNow = Date.now()): number {
  const server = Date.parse(serverNowIso);
  return Number.isFinite(server) ? server - clientNow : 0;
}

/** Milliseconds left before `deadline`, on the server's clock. Never negative. */
export function remainingMs(deadlineIso: string, offsetMs: number, clientNow = Date.now()): number {
  return Math.max(0, Date.parse(deadlineIso) - (clientNow + offsetMs));
}

/** "1:05:09", "12:03", "0:07". */
export function formatCountdown(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}
