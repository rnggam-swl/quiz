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
  /**
   * Who may take part: anyone with the code, signed-in accounts only, or people on the
   * session roster (they type their NIS/e-mail). Replaces the earlier `requireLogin`.
   */
  access: z.enum(["open", "login", "roster"]),
  /** Extra code the participant must type, on top of the join code. */
  passcode: z.string().trim().min(1).max(40).optional(),
  allowEmbed: z.boolean(),
  /** Draw `size` questions per attempt, optionally only those with one of `tags`. */
  questionPool: z
    .object({
      size: z.number().int().min(1).max(500),
      tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
    })
    .optional(),
  /** Exams: may participants go back to earlier questions? */
  navigation: z.enum(["free", "forward"]),
  /** With several attempts, which one counts in the report. */
  attemptScoring: z.enum(["highest", "last", "average"]),
  integrity: z.object({
    fullscreen: z.boolean(),
    logTabSwitch: z.boolean(),
    blockCopyPaste: z.boolean(),
  }),
  /** Live: move on by itself after the reveal and the leaderboard. */
  autoAdvance: z.boolean(),
  /** Live: joining after the first question — play, only watch, or not at all. */
  lateJoin: z.enum(["allow", "spectator", "deny"]),
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
  access: "open",
  allowEmbed: true,
  navigation: "free",
  attemptScoring: "highest",
  integrity: { fullscreen: false, logTabSwitch: false, blockCopyPaste: false },
  autoAdvance: false,
  lateJoin: "allow",
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
    // Anyone with the code by default; the exam form offers roster or login (docs/08).
    access: "open",
    allowEmbed: false,
    integrity: { fullscreen: true, logTabSwitch: true, blockCopyPaste: true },
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
