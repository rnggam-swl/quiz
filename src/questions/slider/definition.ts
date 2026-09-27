import { z } from "zod";

import { scoreResult } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

const finite = z.number().refine(Number.isFinite, "Harus berupa angka.");

const configSchema = z.object({
  min: finite,
  max: finite,
  step: finite.positive(),
  /** The correct value. */
  value: finite,
  /** Accepted distance from `value` for full credit (0 = exact). */
  tolerance: finite.min(0),
  /** Partial credit that shrinks with the distance beyond the tolerance. */
  partial: z.boolean(),
  unit: z.string().max(20).optional(),
});
export type SliderConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ value: finite });
export type SliderAnswer = z.infer<typeof answerSchema>;

export type SliderPublic = { min: number; max: number; step: number; unit?: string };

const EPSILON = 1e-9;
/** More stops than this makes the slider useless on a phone. */
export const MAX_STOPS = 1000;

/** The value nearest to `value` that the slider can land on. */
export function snapToStep(value: number, { min, max, step }: SliderPublic): number {
  const snapped = min + Math.round((value - min) / step) * step;
  // Round away float noise (0.1 steps) so the value displays cleanly.
  return Math.min(max, Math.max(min, Number(snapped.toFixed(10))));
}

/** Where `value` sits on the track, 0–100 (clamped). */
export function positionOf(value: number, { min, max }: Pick<SliderPublic, "min" | "max">): number {
  return max > min ? Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100)) : 0;
}

export const slider: QuestionDefinition<SliderConfig, SliderAnswer, SliderPublic> = {
  type: "slider",
  label: "Slider",
  description: "Geser ke nilai yang tepat, bisa dengan nilai parsial.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_royale: "ok" },
    notes: { battle_buzzer: "Menggeser slider terlalu lambat untuk rebutan." },
    avgSeconds: 15,
    partialCredit: true,
  },

  defaults() {
    return { min: 0, max: 100, step: 1, value: 50, tolerance: 0, partial: false };
  },

  validate(config) {
    const issues: Issue[] = [];
    const range = config.max - config.min;
    if (range <= 0) {
      issues.push({ path: "max", message: "Nilai maksimum harus lebih besar dari minimum." });
      return issues;
    }
    if (config.step > range) {
      issues.push({ path: "step", message: "Langkah lebih besar dari rentang slider." });
    } else if (range / config.step > MAX_STOPS) {
      issues.push({
        path: "step",
        message: `Langkah terlalu kecil (maksimal ${MAX_STOPS} titik).`,
      });
    }
    if (config.value < config.min || config.value > config.max) {
      issues.push({ path: "value", message: "Jawaban benar harus di dalam rentang slider." });
    } else if (
      Math.abs(snapToStep(config.value, config) - config.value) >
      config.tolerance + EPSILON
    ) {
      issues.push({
        path: "value",
        message:
          "Jawaban benar tidak bisa dipilih dengan langkah ini. Ubah langkah atau toleransi.",
      });
    }
    return issues;
  },

  score(config, answer) {
    const distance = Math.abs(answer.value - config.value);
    if (distance <= config.tolerance + EPSILON) return scoreResult(1, 1);
    if (!config.partial) return scoreResult(0, 1);
    // Beyond the tolerance, credit drops linearly and hits 0 at half the range away.
    const range = config.max - config.min;
    if (range <= 0) return scoreResult(0, 1);
    const ratio = 1 - ((distance - config.tolerance) / range) * 2;
    return scoreResult(Math.round(Math.max(0, ratio) * 1000) / 1000, 1);
  },

  stripAnswers(config) {
    return {
      min: config.min,
      max: config.max,
      step: config.step,
      ...(config.unit && { unit: config.unit }),
    };
  },

  isAnswered(answer) {
    return answer != null && Number.isFinite(answer.value);
  },
};
