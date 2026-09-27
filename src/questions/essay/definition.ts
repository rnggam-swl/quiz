import { z } from "zod";

import { createId } from "@/lib/id";

import { scoreResult } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

export const MAX_ESSAY_CHARS = 20_000;
export const MAX_WORD_LIMIT = 5000;
export const MAX_RUBRIC = 10;

const wordLimit = z.number().int().min(1).max(MAX_WORD_LIMIT).nullable();

const rubricItemSchema = z.object({
  id: z.string().min(1).max(40),
  criterion: z.string().max(200),
  /** Weight of this criterion; the grader picks 0..points for it. */
  points: z.number().int().min(1).max(100),
});
export type RubricItem = z.infer<typeof rubricItemSchema>;

const configSchema = z.object({
  minWords: wordLimit,
  maxWords: wordLimit,
  rubric: z.array(rubricItemSchema).max(MAX_RUBRIC),
  /** Grading notes or a model answer — for the grader, shown to participants only on review. */
  guide: z.string().max(2000),
});
export type EssayConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ text: z.string().max(MAX_ESSAY_CHARS) });
export type EssayAnswer = z.infer<typeof answerSchema>;

export type EssayPublic = { minWords: number | null; maxWords: number | null };

/** Words as a person would count them: runs of letters/digits, in any script. */
export function countWords(text: string): number {
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/** Ratio from rubric scores (clamped per criterion), or null when there's no rubric. */
export function rubricRatio(rubric: RubricItem[], scores: Record<string, number>): number | null {
  const total = rubric.reduce((sum, r) => sum + r.points, 0);
  if (total === 0) return null;
  const earned = rubric.reduce(
    (sum, r) => sum + Math.min(r.points, Math.max(0, Number(scores[r.id]) || 0)),
    0,
  );
  return earned / total;
}

export const essay: QuestionDefinition<EssayConfig, EssayAnswer, EssayPublic> = {
  type: "essay",
  label: "Esai",
  description: "Jawaban panjang, dinilai guru dengan rubrik.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok" },
    notes: {
      live: "Esai dinilai manual oleh guru, jadi tidak bisa dinilai langsung saat live.",
      battle_buzzer: "Esai dinilai manual, tidak bisa dipakai untuk rebutan.",
      battle_royale: "Esai dinilai manual, tidak bisa dipakai untuk royale.",
    },
    avgSeconds: 300,
    partialCredit: true,
    manualGrading: true,
  },

  defaults() {
    return {
      minWords: null,
      maxWords: null,
      rubric: [{ id: createId(), criterion: "", points: 4 }],
      guide: "",
    };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (config.minWords !== null && config.maxWords !== null && config.minWords > config.maxWords) {
      issues.push({ path: "maxWords", message: "Batas maksimal kata lebih kecil dari minimal." });
    }
    config.rubric.forEach((item, i) => {
      if (!item.criterion.trim()) {
        issues.push({
          path: `rubric.${i}.criterion`,
          message: `Kriteria rubrik ${i + 1} masih kosong.`,
        });
      }
    });
    return issues;
  },

  // Essays are graded by hand (grade_response); automatic scoring gives nothing.
  score() {
    return scoreResult(0, 0);
  },

  stripAnswers(config) {
    return { minWords: config.minWords, maxWords: config.maxWords };
  },

  isAnswered(answer) {
    return (answer?.text.trim().length ?? 0) > 0;
  },
};
