import type { Policy } from "@/engine/policy";
import type { QuizTheme } from "@/lib/theme";
import type { QuestionType } from "@/questions/registry";
import type { MediaRef } from "@/questions/shared";
import type { ScoreResult } from "@/questions/types";

import type { Progress, Reaction } from "./gamification";

/** What a participant's browser may know about a question — never the answer key. */
export type PlayQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  help: string;
  media: MediaRef[];
  points: number;
  /** Output of the type's stripAnswers(). */
  data: unknown;
};

/** The policy bits the player needs to render (the rest stays on the server). */
export type PlayerPolicy = Pick<
  Policy,
  "feedback" | "gamification" | "showCorrectAnswer" | "attempts"
>;

export type PlayInfo = {
  title: string;
  description: string;
  coverUrl: string | null;
  theme: QuizTheme;
  questionCount: number;
  policy: PlayerPolicy;
};

/** Revealed after answering, when the policy allows it. */
export type Reveal = { config: unknown; explanation: string };

export type AnswerOutcome = {
  /** Null while a hand-graded answer (essay) waits for the host. */
  result: ScoreResult | null;
  points: number;
  reveal?: Reveal;
  progress?: Progress;
  reaction?: Reaction;
};

export type AnsweredQuestion = { answer: unknown; outcome?: AnswerOutcome };

export type AttemptView = {
  attemptId: string;
  attemptNo: number;
  questions: PlayQuestion[];
  /** Already-answered questions, for resuming after a reload. */
  answered: Record<string, AnsweredQuestion>;
  progress: Progress;
};

export type ReviewItem = {
  questionId: string;
  prompt: string;
  type: QuestionType;
  data: unknown;
  answer: unknown | null;
  result: ScoreResult | null;
  /** Answered, but waiting for manual grading. */
  pending?: boolean;
  reveal?: Reveal;
};

export type AttemptSummary = {
  /** True when the policy releases results later: only counts are real, the rest is zeroed. */
  withheld?: boolean;
  score: number;
  maxScore: number;
  percent: number;
  xp: number;
  maxStreak: number;
  correctCount: number;
  questionCount: number;
  review: ReviewItem[];
  canRetry: boolean;
};

export type PlayError =
  | "session_closed"
  | "not_found"
  | "invalid"
  | "attempt_limit"
  | "attempt_closed"
  | "already_answered"
  | "deadline_passed"
  | "unauthorized"
  | "no_open_attempt"
  // Exams (P4)
  | "passcode"
  | "not_on_roster"
  | "login_required"
  | "not_open_yet"
  | "network";

export type Result<T> = ({ ok: true } & T) | { ok: false; error: PlayError };

/**
 * What the practice player needs from the outside world. Server Actions
 * implement it for real sessions; a local in-memory version powers the
 * in-editor preview and the playground.
 */
export type PracticeAdapter = {
  join: (nickname: string) => Promise<Result<{ token: string; nickname: string }>>;
  /** Resume the open attempt or start a new one; with resumeOnly, never start (→ no_open_attempt). */
  start: (
    token: string,
    options?: { resumeOnly?: boolean },
  ) => Promise<Result<{ attempt: AttemptView }>>;
  answer: (
    token: string,
    attemptId: string,
    questionId: string,
    answer: unknown,
    timeMs: number,
  ) => Promise<Result<{ outcome?: AnswerOutcome }>>;
  finish: (token: string, attemptId: string) => Promise<Result<{ summary: AttemptSummary }>>;
};
