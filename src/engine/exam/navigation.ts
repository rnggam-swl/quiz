/** The exam's number panel and navigation rules (docs/08-mode-exam.md#navigasi). */

export type QuestionMark = "answered" | "empty" | "flagged";

/** Flagged ("ragu-ragu") wins over answered, so doubts stay visible before submitting. */
export function markOf(answered: boolean, flagged: boolean): QuestionMark {
  if (flagged) return "flagged";
  return answered ? "answered" : "empty";
}

/**
 * Whether the participant may open question `target`. With forward-only navigation they
 * can't return to a question they have left, only move on to the next one.
 */
export function canVisit(
  navigation: "free" | "forward",
  current: number,
  target: number,
  count: number,
): boolean {
  if (target < 0 || target >= count) return false;
  return navigation === "free" || target === current || target === current + 1;
}

export type SubmitCheck = { unanswered: number; flagged: number };

/** "3 soal belum dijawab, 2 ditandai ragu" data for the confirmation before submitting. */
export function submitCheck(marks: QuestionMark[]): SubmitCheck {
  return {
    unanswered: marks.filter((m) => m === "empty").length,
    flagged: marks.filter((m) => m === "flagged").length,
  };
}

export function submitWarning({ unanswered, flagged }: SubmitCheck): string | null {
  const parts = [
    unanswered > 0 && `${unanswered} soal belum dijawab`,
    flagged > 0 && `${flagged} ditandai ragu-ragu`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(", ")}.` : null;
}
