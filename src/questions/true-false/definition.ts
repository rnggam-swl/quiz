import { z } from "zod";

import { scoreResult } from "../shared";
import type { QuestionDefinition } from "../types";

const configSchema = z.object({ correct: z.boolean() });
export type TrueFalseConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ value: z.boolean() });
export type TrueFalseAnswer = z.infer<typeof answerSchema>;

export type TrueFalsePublic = Record<string, never>;

export const trueFalse: QuestionDefinition<TrueFalseConfig, TrueFalseAnswer, TrueFalsePublic> = {
  type: "true_false",
  label: "Benar / Salah",
  description: "Pernyataan yang dijawab benar atau salah.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_buzzer: "ok", battle_royale: "ok" },
    avgSeconds: 8,
    partialCredit: false,
  },

  defaults() {
    return { correct: true };
  },

  validate() {
    return [];
  },

  score(config, answer) {
    return scoreResult(answer.value === config.correct ? 1 : 0, 1);
  },

  stripAnswers() {
    return {};
  },

  isAnswered(answer) {
    return typeof answer?.value === "boolean";
  },
};
