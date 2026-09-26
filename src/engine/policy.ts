import { z } from "zod";

import { SESSION_MODES, type SessionMode } from "@/questions/types";

/**
 * Rules a session runs under (`sessions.policy`, docs/03-data-model.md#policy).
 * One quiz can be played under different policies: practice today, exam next week.
 */
export const policySchema = z.object({
  feedback: z.enum(["instant", "end", "none"]),
  showCorrectAnswer: z.boolean(),
  gamification: z.boolean(),
  scoring: z.enum(["accuracy", "speed", "first_correct", "elimination"]),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  /** 0 = unlimited. */
  attempts: z.number().int().min(0).max(100),
  timer: z.object({
    perQuestionS: z.number().int().min(5).max(600).optional(),
    totalS: z
      .number()
      .int()
      .min(60)
      .max(6 * 3600)
      .optional(),
  }),
  releaseResults: z.enum(["immediately", "after_close", "manual"]),
  requireLogin: z.boolean(),
  allowEmbed: z.boolean(),
});
export type Policy = z.infer<typeof policySchema>;

const PRACTICE: Policy = {
  feedback: "instant",
  showCorrectAnswer: true,
  gamification: true,
  scoring: "accuracy",
  shuffleQuestions: false,
  shuffleOptions: true,
  attempts: 0,
  timer: {},
  releaseResults: "immediately",
  requireLogin: false,
  allowEmbed: true,
};

/** Defaults per mode; later phases fill in their own (exam P4, live P5, battle P6–P7). */
export const DEFAULT_POLICIES: Record<SessionMode, Policy> = {
  practice: PRACTICE,
  exam: {
    ...PRACTICE,
    feedback: "none",
    showCorrectAnswer: false,
    gamification: false,
    shuffleQuestions: true,
    attempts: 1,
    timer: { totalS: 3600 },
    releaseResults: "after_close",
    requireLogin: true,
    allowEmbed: false,
  },
  live: { ...PRACTICE, scoring: "speed", shuffleOptions: false, timer: { perQuestionS: 20 } },
  battle_buzzer: {
    ...PRACTICE,
    scoring: "first_correct",
    shuffleOptions: false,
    timer: { perQuestionS: 20 },
  },
  battle_royale: {
    ...PRACTICE,
    scoring: "elimination",
    shuffleOptions: false,
    timer: { perQuestionS: 20 },
  },
};

/** Read a stored policy, filling gaps from the mode's defaults (older rows, partial JSON). */
export function resolvePolicy(mode: SessionMode, stored: unknown): Policy {
  const base = DEFAULT_POLICIES[mode];
  const partial = policySchema.partial().safeParse(stored);
  if (!partial.success) return base;
  const merged = { ...base, ...partial.data };
  return policySchema.safeParse(merged).success ? merged : base;
}

export const sessionModeSchema = z.enum(SESSION_MODES);
