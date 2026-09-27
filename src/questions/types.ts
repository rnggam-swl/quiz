import type { z } from "zod";

/** Session modes a question type can be played in (docs/04-question-types.md#matriks-kapabilitas). */
export const SESSION_MODES = [
  "practice",
  "exam",
  "live",
  "battle_buzzer",
  "battle_royale",
] as const;
export type SessionMode = (typeof SESSION_MODES)[number];

export type ScoreResult = {
  /** Units earned (can be fractional only if a type says so). */
  correct: number;
  /** Units available; 0 means the question is not scored. */
  total: number;
  /** correct / total in [0, 1]; 0 when total is 0. */
  ratio: number;
};

/** A publish-blocking problem. `path` points into the config (e.g. "options.2.text") for the editor to focus. */
export type Issue = { path?: string; message: string };

export type StripContext = {
  /**
   * The same seed must always produce the same order. Pass the attempt seed, or a
   * session-wide seed when everyone must see one order (live/battle with a projector) —
   * some types (e.g. Matching's right column) shuffle regardless of `shuffle`.
   */
  seed: number;
  /** Whether options/items may be shuffled (policy.shuffleOptions). */
  shuffle: boolean;
  /**
   * Exams send a branching story node by node (docs/04 · Branching). When set, only the
   * start node and the nodes along this (server-validated) path are included.
   */
  storyPath?: readonly string[];
};

export type Capabilities = {
  /** Modes where the type may be used; "warn" modes are allowed but flagged in the editor. */
  modes: Partial<Record<SessionMode, "ok" | "warn">>;
  /** Why a mode is "warn" (or unsupported), shown next to the type in the editor. */
  notes?: Partial<Record<SessionMode, string>>;
  /** Rough time to answer, used for default timers and battle suitability. */
  avgSeconds: number;
  partialCredit: boolean;
  manualGrading?: boolean;
};

/**
 * Server-safe half of a question type: pure data and functions, no React.
 * Scoring and stripping run on the server; the editor and player import the
 * matching Editor/Player components from `ui.tsx`.
 *
 * - `Config`  — full config stored in `questions.config`, includes the answer key.
 * - `Answer`  — what a participant submits.
 * - `Public`  — what a participant receives: config without the answer key.
 */
export interface QuestionDefinition<Config, Answer, Public> {
  type: string;
  label: string;
  /** Short helper text shown in the "add question" menu. */
  description: string;
  configSchema: z.ZodType<Config>;
  answerSchema: z.ZodType<Answer>;
  capabilities: Capabilities;
  /** A fresh config for a newly added question. May be incomplete (e.g. no correct option yet). */
  defaults(): Config;
  /** Problems that must be fixed before publishing. Empty array = ready. */
  validate(config: Config): Issue[];
  /** Grade an answer. Must be pure and total: never throw on odd-but-schema-valid answers. */
  score(config: Config, answer: Answer): ScoreResult;
  /** Participant-safe version of the config (no answer key), shuffled per `ctx`. */
  stripAnswers(config: Config, ctx: StripContext): Public;
  /** Whether an answer counts as "answered" (enables Submit, drives the progress dots). */
  isAnswered(answer: Answer | null | undefined): boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any -- heterogeneous registry + inference helpers */
export type AnyQuestionDefinition = QuestionDefinition<any, any, any>;

export type ConfigOf<D> = D extends QuestionDefinition<infer C, any, any> ? C : never;
export type AnswerOf<D> = D extends QuestionDefinition<any, infer A, any> ? A : never;
export type PublicOf<D> = D extends QuestionDefinition<any, any, infer P> ? P : never;
/* eslint-enable @typescript-eslint/no-explicit-any */
