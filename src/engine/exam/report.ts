import type { SnapshotQuestion } from "@/engine/practice/snapshot";
import { getDefinition } from "@/questions/registry";

/** Exam report (docs/08-mode-exam.md#laporan-ujian): scores, item analysis and CSV export. */

export function percentOf(score: number | null, maxScore: number | null): number | null {
  if (score === null || !maxScore) return null;
  return Math.round((score / maxScore) * 100);
}

export type ScoredAttempt = {
  participantId: string;
  attemptNo: number;
  status: "in_progress" | "submitted" | "expired";
  percent: number | null;
};

/**
 * The percentage that counts for each participant when several attempts are allowed:
 * the highest, the last finished, or the average of the finished ones.
 */
export function finalPercent(
  attempts: ScoredAttempt[],
  method: "highest" | "last" | "average",
): Map<string, number | null> {
  const byParticipant = new Map<string, ScoredAttempt[]>();
  for (const a of attempts) {
    byParticipant.set(a.participantId, [...(byParticipant.get(a.participantId) ?? []), a]);
  }
  const out = new Map<string, number | null>();
  for (const [id, list] of byParticipant) {
    const done = list
      .filter((a) => a.status !== "in_progress" && a.percent !== null)
      .sort((a, b) => a.attemptNo - b.attemptNo);
    if (done.length === 0) out.set(id, null);
    else if (method === "highest") out.set(id, Math.max(...done.map((a) => a.percent!)));
    else if (method === "last") out.set(id, done.at(-1)!.percent);
    else out.set(id, Math.round(done.reduce((s, a) => s + a.percent!, 0) / done.length));
  }
  return out;
}

export type ItemResponse = {
  questionId: string;
  answer: unknown;
  /** Null while waiting for manual grading. */
  correct: number | null;
  total: number | null;
  timeMs: number | null;
};

export type OptionCount = { label: string; count: number; correct: boolean };

export type ItemStat = {
  questionId: string;
  number: number;
  prompt: string;
  typeLabel: string;
  answered: number;
  /** Graded answers only; null when none are graded yet. */
  percentCorrect: number | null;
  avgTimeMs: number | null;
  pending: number;
  /** Below 30% with at least MIN_FOR_FLAG graded answers: maybe the key is wrong. */
  flagged: boolean;
  options?: OptionCount[];
};

export const FLAG_BELOW_PERCENT = 30;
export const MIN_FOR_FLAG = 3;

type Choice = { id: string; text: string };

/** How often each option was picked, for types where that tells the teacher something. */
function distribution(q: SnapshotQuestion, answers: unknown[]): OptionCount[] | undefined {
  const config = q.config as Record<string, unknown>;
  const count = (pick: (a: Record<string, unknown>) => boolean) =>
    answers.filter((a) => a && typeof a === "object" && pick(a as Record<string, unknown>)).length;
  const label = (c: Choice, i: number) => c.text.trim() || `Opsi ${i + 1}`;

  if (q.type === "multiple_choice") {
    const correct = new Set(config.correctIds as string[]);
    return (config.options as Choice[]).map((o, i) => ({
      label: label(o, i),
      correct: correct.has(o.id),
      count: count((a) => Array.isArray(a.selectedIds) && a.selectedIds.includes(o.id)),
    }));
  }
  if (q.type === "odd_one_out") {
    return (config.items as Choice[]).map((o, i) => ({
      label: label(o, i),
      correct: o.id === config.oddId,
      count: count((a) => a.selectedId === o.id),
    }));
  }
  if (q.type === "true_false") {
    return [true, false].map((value) => ({
      label: value ? "Benar" : "Salah",
      correct: config.correct === value,
      count: count((a) => a.value === value),
    }));
  }
  return undefined;
}

export function itemAnalysis(questions: SnapshotQuestion[], responses: ItemResponse[]): ItemStat[] {
  return questions.map((q, i) => {
    const mine = responses.filter((r) => r.questionId === q.id);
    const graded = mine.filter(
      (r) => r.correct !== null && r.total !== null && Number(r.total) > 0,
    );
    const percentCorrect = graded.length
      ? Math.round(
          (graded.reduce((s, r) => s + Number(r.correct) / Number(r.total), 0) / graded.length) *
            100,
        )
      : null;
    const timed = mine.filter((r) => r.timeMs !== null);
    return {
      questionId: q.id,
      number: i + 1,
      prompt: q.prompt,
      typeLabel: getDefinition(q.type).label,
      answered: mine.length,
      percentCorrect,
      avgTimeMs: timed.length
        ? Math.round(timed.reduce((s, r) => s + Number(r.timeMs), 0) / timed.length)
        : null,
      pending: mine.filter((r) => r.correct === null).length,
      flagged:
        percentCorrect !== null &&
        graded.length >= MIN_FOR_FLAG &&
        percentCorrect < FLAG_BELOW_PERCENT,
      options: distribution(
        q,
        mine.map((r) => r.answer),
      ),
    };
  });
}

type Cell = string | number | null | undefined;

/**
 * CSV that Excel opens correctly (UTF-8 BOM, CRLF). Cells that start like a formula
 * are prefixed with ' — participant names are untrusted (CSV injection).
 */
export function toCsv(rows: Cell[][]): string {
  const cell = (value: Cell) => {
    let text = value === null || value === undefined ? "" : String(value);
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${rows.map((row) => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
