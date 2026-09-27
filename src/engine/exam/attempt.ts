import type { Policy } from "@/engine/policy";
import {
  questionsInOrder,
  summarize,
  toPlayQuestion,
  type StoredResponse,
} from "@/engine/practice/attempt";
import type { Snapshot } from "@/engine/practice/snapshot";
import type { PlayQuestion } from "@/engine/practice/types";

import type { ExamPhase, ExamResult } from "./types";

type Window = { status: string; opens_at: string | null; closes_at: string | null };

/** Upcoming until opens_at, open until closes_at (or until the host ends it). */
export function examPhase(session: Window, now = Date.now()): ExamPhase {
  if (session.status === "ended" || session.status === "draft") return "closed";
  if (session.opens_at && now < Date.parse(session.opens_at)) return "upcoming";
  if (session.closes_at && now >= Date.parse(session.closes_at)) return "closed";
  return "open";
}

/**
 * Whether participants may see their score: straight away, after the exam closes, or
 * once the host releases it — a manual release always wins.
 */
export function resultsReleased(
  policy: Pick<Policy, "releaseResults">,
  session: Window & { results_released_at: string | null },
  now = Date.now(),
): boolean {
  if (session.results_released_at) return true;
  if (policy.releaseResults === "immediately") return true;
  if (policy.releaseResults === "after_close") return examPhase(session, now) === "closed";
  return false;
}

/**
 * The attempt's questions for the exam shell. Stories come node by node: only the nodes
 * along the saved answer's path are included (P4-07b).
 */
export function examQuestions(
  snapshot: Snapshot,
  questionIds: string[],
  seed: number,
  policy: Policy,
  answers: Record<string, unknown>,
): PlayQuestion[] {
  return questionsInOrder(snapshot, questionIds).map((q) => {
    if (q.type !== "branching") return toPlayQuestion(q, seed, policy);
    const saved = answers[q.id] as { path?: unknown } | undefined;
    const path = Array.isArray(saved?.path) ? saved.path.filter((x) => typeof x === "string") : [];
    return toPlayQuestion(q, seed, policy, path);
  });
}

export type ClosedAttempt = {
  attempt_no: number;
  status: "submitted" | "expired";
  submitted_at: string | null;
  question_ids: string[];
  seed: number;
  score: number | null;
  max_score: number | null;
};

/** What a participant sees after submitting: a receipt, and the score once released. */
export function examResult({
  attempt,
  snapshot,
  policy,
  responses,
  released,
  canRetry,
}: {
  attempt: ClosedAttempt;
  snapshot: Snapshot;
  policy: Policy;
  responses: Map<string, StoredResponse>;
  released: boolean;
  canRetry: boolean;
}): ExamResult {
  const base = {
    attemptNo: attempt.attempt_no,
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    released,
    canRetry,
  };
  if (!released) return base;

  const summary = summarize({
    snapshot,
    questionIds: attempt.question_ids,
    seed: Number(attempt.seed),
    policy,
    responses,
    canRetry,
  });
  // The stored total includes hand-graded points; the summary only knows saved rows.
  const score = attempt.score === null ? summary.score : Number(attempt.score);
  const maxScore = attempt.max_score === null ? summary.maxScore : Number(attempt.max_score);
  return {
    ...base,
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    pendingCount: summary.review.filter((r) => r.pending).length,
    ...(policy.showCorrectAnswer && { review: summary.review }),
  };
}
