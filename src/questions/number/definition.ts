import { z } from "zod";

import { scoreResult } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

const finite = z.number().refine(Number.isFinite, "Harus berupa angka.");

const configSchema = z.object({
  value: finite,
  /** Accepted distance from `value` (0 = exact). */
  tolerance: finite.min(0),
  unit: z.string().max(20).optional(),
});
export type NumberConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ value: finite });
export type NumberAnswer = z.infer<typeof answerSchema>;

export type NumberPublic = { unit?: string };

// Absorbs float noise like 0.1 + 0.2 so "0.3 ± 0" is still exact.
const EPSILON = 1e-9;

/** Parse user input, accepting Indonesian decimal commas ("3,5") and thousand dots ("1.250,5"). */
export function parseNumberInput(raw: string): number | null {
  let text = raw.trim().replace(/\s/g, "");
  if (!text) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export const numberQuestion: QuestionDefinition<NumberConfig, NumberAnswer, NumberPublic> = {
  type: "number",
  label: "Angka",
  description: "Jawaban berupa angka, dengan toleransi bila perlu.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_buzzer: "warn", battle_royale: "ok" },
    avgSeconds: 20,
    partialCredit: false,
  },

  defaults() {
    return { value: 0, tolerance: 0 };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (config.tolerance < 0) {
      issues.push({ path: "tolerance", message: "Toleransi tidak boleh negatif." });
    }
    return issues;
  },

  score(config, answer) {
    const ok = Math.abs(answer.value - config.value) <= config.tolerance + EPSILON;
    return scoreResult(ok ? 1 : 0, 1);
  },

  stripAnswers(config) {
    return config.unit ? { unit: config.unit } : {};
  },

  isAnswered(answer) {
    return typeof answer?.value === "number" && Number.isFinite(answer.value);
  },
};
