import type { ScoreResult } from "@/questions/types";

/**
 * XP, streak and reactions — ported from the prototype's gamification layer
 * (gamifyOnCheck / gamifyComputeRetro / gamifyReactionMsg).
 */
export type Progress = { xp: number; streak: number; maxStreak: number };

export const EMPTY_PROGRESS: Progress = { xp: 0, streak: 0, maxStreak: 0 };

/** Fold one graded answer into the running progress. Unscored questions (total 0) don't count. */
export function advance(progress: Progress, result: ScoreResult): Progress {
  if (result.total === 0) return progress;
  if (result.ratio === 1) {
    const streak = progress.streak + 1;
    // Full credit: 10 XP plus a streak bonus of 2 per extra in-a-row, capped at +10.
    const xp = progress.xp + 10 + Math.min(streak - 1, 5) * 2;
    return { xp, streak, maxStreak: Math.max(progress.maxStreak, streak) };
  }
  return {
    xp: progress.xp + Math.round(10 * result.ratio),
    streak: 0,
    maxStreak: progress.maxStreak,
  };
}

export function progressOf(results: ScoreResult[]): Progress {
  return results.reduce(advance, EMPTY_PROGRESS);
}

export type Reaction = { emoji: string; message: string; tone: "great" | "ok" | "soft" };

const SOFT: Reaction[] = [
  { emoji: "🌱", message: "Belum pas, coba lagi ya", tone: "soft" },
  { emoji: "💙", message: "Yuk dicoba lagi, kamu pasti bisa", tone: "soft" },
];

/** What the mascot says after an answer. `pick` makes the soft message deterministic in tests. */
export function reactionFor(result: ScoreResult, streak: number, pick = Math.random()): Reaction {
  if (result.ratio === 1) {
    if (streak >= 5) return { emoji: "🌟", message: "Unstoppable!", tone: "great" };
    if (streak >= 4)
      return { emoji: "⚡", message: "Nggak ada yang bisa hentikan!", tone: "great" };
    if (streak >= 3) return { emoji: "🔥", message: "On fire!", tone: "great" };
    if (streak >= 2) return { emoji: "🎯", message: "Dua kali beruntun!", tone: "great" };
    return { emoji: "👍", message: "Mantap!", tone: "great" };
  }
  if (result.ratio > 0)
    return { emoji: "💪", message: "Lumayan, ada yang perlu dicek lagi", tone: "ok" };
  return SOFT[Math.floor(pick * SOFT.length) % SOFT.length]!;
}

/** Result band used to colour the final score (prototype .pv-score-box great/ok/low). */
export function scoreBand(percent: number): "great" | "ok" | "low" {
  if (percent >= 80) return "great";
  if (percent >= 50) return "ok";
  return "low";
}
