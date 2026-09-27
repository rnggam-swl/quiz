import { getDefinition, QUESTION_TYPES, type QuestionType } from "./registry";
import { SESSION_MODES, type SessionMode } from "./types";

export const MODE_LABELS: Record<SessionMode, string> = {
  practice: "Latihan",
  exam: "Ujian",
  live: "Live",
  battle_buzzer: "Rebutan",
  battle_royale: "Royale",
};

/** "warn" = allowed but flagged in the editor (docs/04-question-types.md#matriks-kapabilitas). */
export type ModeSupport = "ok" | "warn" | "no";

export function modeSupport(type: QuestionType, mode: SessionMode): ModeSupport {
  return getDefinition(type).capabilities.modes[mode] ?? "no";
}

/** Why a type is flagged or unavailable in a mode, when the type explains it. */
export function modeNote(type: QuestionType, mode: SessionMode): string | undefined {
  return getDefinition(type).capabilities.notes?.[mode];
}

/** Types usable in `mode` (flagged ones included) — for filtering the "add question" menu. */
export function typesForMode(mode: SessionMode): QuestionType[] {
  return QUESTION_TYPES.filter((type) => modeSupport(type, mode) !== "no");
}

/** Modes where the type can't be used at all, e.g. ["Rebutan", "Royale"]. */
export function unsupportedModes(type: QuestionType): string[] {
  return SESSION_MODES.filter((mode) => modeSupport(type, mode) === "no").map(
    (mode) => MODE_LABELS[mode],
  );
}
