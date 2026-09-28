/**
 * Live scoring (docs/09-mode-live.md#poin-kecepatan). The database computes the real
 * points in record_live_answer() from its own clock; these mirror it for the local
 * engine and the tests.
 */

/** 3-2-1 before a question opens. */
export const COUNTDOWN_MS = 3000;
/** How long the reveal and the leaderboard stay up when auto-advance is on. */
export const REVEAL_MS = 5000;
export const LEADERBOARD_MS = 5000;
/** Network grace after a round closes (the host screen locks it on time anyway). */
export const ANSWER_GRACE_MS = 1000;
export const STREAK_BONUS_STEP = 100;
export const STREAK_BONUS_MAX = 500;

/**
 * round(points × ratio × (1 − elapsed / limit / 2)): a correct answer right away is
 * worth 100 %, one in the last moment 50 %.
 */
export function speedPoints(
  points: number,
  ratio: number,
  elapsedMs: number,
  limitMs: number,
): number {
  if (limitMs <= 0) return 0;
  const r = Math.min(1, Math.max(0, ratio));
  const t = Math.min(limitMs, Math.max(0, elapsedMs));
  return Math.round(Math.max(0, points) * r * (1 - t / limitMs / 2));
}

/** +100 for each correct answer in a row from the second one, at most +500. */
export function streakBonus(streak: number): number {
  return streak >= 2 ? Math.min(STREAK_BONUS_MAX, STREAK_BONUS_STEP * (streak - 1)) : 0;
}

/** The streak after an answer: full credit extends it, anything less resets it. */
export function nextStreak(streak: number, ratio: number, total: number): number {
  if (total <= 0) return streak;
  return ratio >= 1 ? streak + 1 : 0;
}
