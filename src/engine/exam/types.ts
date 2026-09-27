import type { Policy } from "@/engine/policy";
import type { PlayQuestion, Result, ReviewItem } from "@/engine/practice/types";
import type { PublicStoryNode } from "@/questions/branching/definition";

import type { IntegrityEvent } from "./integrity";

/** Before the window, inside it, or after it (or ended early by the host). */
export type ExamPhase = "upcoming" | "open" | "closed";

/** What the exam's landing page shows before anyone joins — no questions. */
export type ExamInfo = {
  sessionId: string;
  title: string;
  quizTitle: string;
  description: string;
  /** Questions per attempt (the pool size when there's a question bank). */
  questionCount: number;
  durationS: number | null;
  opensAt: string | null;
  closesAt: string | null;
  phase: ExamPhase;
  access: Policy["access"];
  needsPasscode: boolean;
  navigation: Policy["navigation"];
  integrity: Policy["integrity"];
  attempts: number;
  releaseResults: Policy["releaseResults"];
  serverNow: string;
};

export type ExamView = {
  attemptId: string;
  attemptNo: number;
  questions: PlayQuestion[];
  /** Saved answers by question id, for resuming. */
  answers: Record<string, unknown>;
  deadline: string | null;
  /** The server's clock when this was sent, to correct the device's clock. */
  serverNow: string;
};

export type ExamResult = {
  attemptNo: number;
  status: "submitted" | "expired";
  submittedAt: string | null;
  /** Whether the teacher has released results (by policy or by hand). */
  released: boolean;
  /** Only once released. */
  score?: number;
  maxScore?: number;
  percent?: number;
  /** Answers still waiting for the teacher (essays). */
  pendingCount?: number;
  /** Only once released and when the policy shows correct answers. */
  review?: ReviewItem[];
  canRetry: boolean;
};

export type JoinInput = { nickname?: string; identifier?: string; passcode?: string };

/**
 * The exam player's view of the outside world: Server Actions for real exams, an
 * in-memory engine for the playground. Everything the server decides stays there.
 */
export type ExamAdapter = {
  join: (
    input: JoinInput,
  ) => Promise<Result<{ token: string; nickname: string; otherDevice: boolean }>>;
  /** Resume the open attempt, or — when the last one is closed — report its result. */
  start: (
    token: string,
    options?: { again?: boolean },
  ) => Promise<Result<{ exam: ExamView } | { result: ExamResult }>>;
  save: (
    token: string,
    attemptId: string,
    questionId: string,
    answer: unknown,
    timeMs: number,
  ) => Promise<Result<object>>;
  storyStep: (
    token: string,
    attemptId: string,
    questionId: string,
    path: string[],
  ) => Promise<Result<{ nodes: PublicStoryNode[] }>>;
  logIntegrity: (
    token: string,
    attemptId: string,
    events: IntegrityEvent[],
  ) => Promise<Result<object>>;
  finish: (token: string, attemptId: string) => Promise<Result<{ result: ExamResult }>>;
};
