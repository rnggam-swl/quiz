import { z } from "zod";

import { scoreResult } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

const MAX_ANSWER = 200;

const configSchema = z.object({
  /** Every accepted spelling, e.g. ["Soekarno", "Sukarno", "Ir. Soekarno"]. */
  accepted: z.array(z.string().max(MAX_ANSWER)).max(20),
  caseSensitive: z.boolean(),
  /** Max typos (Levenshtein distance) still counted as correct; only for answers ≥ 4 chars. */
  fuzzy: z.union([z.literal(0), z.literal(1), z.literal(2)]),
});
export type ShortAnswerConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ text: z.string().max(MAX_ANSWER) });
export type ShortAnswerAnswer = z.infer<typeof answerSchema>;

export type ShortAnswerPublic = { maxLength: number };

/** Answers shorter than this must match exactly, so "cat" never accepts "car". */
export const FUZZY_MIN_LENGTH = 4;

export function normalizeAnswer(text: string, caseSensitive: boolean): string {
  const collapsed = text.normalize("NFKC").trim().replace(/\s+/g, " ");
  return caseSensitive ? collapsed : collapsed.toLocaleLowerCase("id");
}

/** Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      row.push(value);
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > max) return max + 1;
    prev = row;
  }
  return prev[b.length]!;
}

export const shortAnswer: QuestionDefinition<
  ShortAnswerConfig,
  ShortAnswerAnswer,
  ShortAnswerPublic
> = {
  type: "short_answer",
  label: "Isian Singkat",
  description: "Peserta mengetik jawaban pendek.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_buzzer: "warn", battle_royale: "ok" },
    notes: { battle_buzzer: "Kecepatan mengetik ikut menentukan hasil rebutan." },
    avgSeconds: 20,
    partialCredit: false,
  },

  defaults() {
    return { accepted: [""], caseSensitive: false, fuzzy: 0 };
  },

  validate(config) {
    const issues: Issue[] = [];
    const filled = config.accepted.map((a) => a.trim()).filter(Boolean);
    if (filled.length === 0) {
      issues.push({ path: "accepted", message: "Isi minimal satu jawaban yang diterima." });
    }
    config.accepted.forEach((answer, i) => {
      if (!answer.trim() && config.accepted.length > 1) {
        issues.push({ path: `accepted.${i}`, message: `Jawaban diterima #${i + 1} masih kosong.` });
      }
    });
    return issues;
  },

  score(config, answer) {
    const given = normalizeAnswer(answer.text, config.caseSensitive);
    if (!given) return scoreResult(0, 1);
    const ok = config.accepted.some((raw) => {
      const expected = normalizeAnswer(raw, config.caseSensitive);
      if (!expected) return false;
      if (expected === given) return true;
      if (config.fuzzy === 0 || expected.length < FUZZY_MIN_LENGTH) return false;
      return editDistance(expected, given, config.fuzzy) <= config.fuzzy;
    });
    return scoreResult(ok ? 1 : 0, 1);
  },

  stripAnswers() {
    return { maxLength: MAX_ANSWER };
  },

  isAnswered(answer) {
    return (answer?.text.trim().length ?? 0) > 0;
  },
};
