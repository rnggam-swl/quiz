import type { LivePhase } from "./types";

/**
 * What "Lanjut" does from each phase — the label on the host's button. The database
 * (advance_live) decides the real transition; this only names it.
 */
export function nextStepLabel(
  phase: LivePhase,
  round: number | null,
  questionCount: number,
): string {
  const last = round !== null && round + 1 >= questionCount;
  switch (phase) {
    case "lobby":
      return "Mulai";
    case "countdown":
      return "Buka soal";
    case "open":
      return "Tutup soal";
    case "reveal":
      return "Papan skor";
    case "leaderboard":
      return last ? "Podium" : "Soal berikutnya";
    case "podium":
      return "Selesai";
    case "ended":
      return "Selesai";
  }
}

/** Phases a timer ends by itself (the host screen then calls advance "auto"). */
export function timedPhase(phase: LivePhase, autoAdvance: boolean): boolean {
  if (phase === "countdown" || phase === "open") return true;
  return autoAdvance && (phase === "reveal" || phase === "leaderboard");
}
