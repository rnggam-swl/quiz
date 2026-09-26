import type { Policy } from "@/engine/policy";
import { deriveSeed, shuffle } from "@/lib/seed-random";
import { getDefinition } from "@/questions/registry";
import { scoreResult } from "@/questions/shared";
import type { ScoreResult } from "@/questions/types";

import { advance, EMPTY_PROGRESS, progressOf, reactionFor, type Progress } from "./gamification";
import type { Snapshot, SnapshotQuestion } from "./snapshot";
import type {
  AnsweredQuestion,
  AnswerOutcome,
  AttemptSummary,
  PlayQuestion,
  ReviewItem,
} from "./types";

/** Question order and the maximum score for a new attempt. */
export function planAttempt(snapshot: Snapshot, policy: Policy, seed: number) {
  const ids = snapshot.questions.map((q) => q.id);
  const questionIds = policy.shuffleQuestions ? shuffle(ids, seed) : ids;
  const maxScore = snapshot.questions.reduce((sum, q) => sum + q.points, 0);
  return { questionIds, maxScore };
}

/** Snapshot questions in the attempt's order; ids missing from the snapshot are skipped. */
export function questionsInOrder(snapshot: Snapshot, questionIds: string[]): SnapshotQuestion[] {
  const byId = new Map(snapshot.questions.map((q) => [q.id, q]));
  return questionIds.map((id) => byId.get(id)).filter((q): q is SnapshotQuestion => !!q);
}

/**
 * The participant-safe view of a question. Each question gets its own derived
 * seed so option orders don't repeat a pattern across the quiz.
 */
export function toPlayQuestion(
  q: SnapshotQuestion,
  attemptSeed: number,
  policy: Policy,
): PlayQuestion {
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    help: q.help,
    media: q.media,
    points: q.points,
    data: getDefinition(q.type).stripAnswers(q.config, {
      seed: deriveSeed(attemptSeed, q.id),
      shuffle: policy.shuffleOptions,
    }),
  };
}

export type Graded = { answer: unknown; result: ScoreResult; points: number };

/** Parse and score a raw answer from the client. Null when it doesn't match the type's schema. */
export function gradeAnswer(q: SnapshotQuestion, raw: unknown): Graded | null {
  const definition = getDefinition(q.type);
  const answer = definition.answerSchema.safeParse(raw);
  if (!answer.success) return null;
  const result = definition.score(q.config, answer.data);
  return { answer: answer.data, result, points: Math.round(q.points * result.ratio) };
}

/** Rebuild a stored response's result (responses keep correct/total, not the ratio). */
export function storedResult(correct: number | null, total: number | null): ScoreResult | null {
  if (correct === null || total === null) return null;
  return scoreResult(Number(correct), Number(total));
}

/** What the player may learn right after answering, per the policy. */
export function outcomeFor(
  policy: Policy,
  q: SnapshotQuestion,
  graded: { result: ScoreResult; points: number },
  progressAfter: Progress,
  reactionPick?: number,
): AnswerOutcome | undefined {
  if (policy.feedback !== "instant") return undefined;
  return {
    result: graded.result,
    points: graded.points,
    ...(policy.showCorrectAnswer && { reveal: { config: q.config, explanation: q.explanation } }),
    ...(policy.gamification && {
      progress: progressAfter,
      reaction: reactionFor(graded.result, progressAfter.streak, reactionPick),
    }),
  };
}

export type StoredResponse = { answer: unknown; result: ScoreResult | null; points: number };

/**
 * Answered questions (for resuming) with the feedback each one earned, plus the
 * running progress — streaks count in attempt order, not answer time.
 */
export function answeredState(
  policy: Policy,
  questions: SnapshotQuestion[],
  responses: Map<string, StoredResponse>,
): { answered: Record<string, AnsweredQuestion>; progress: Progress } {
  let progress = EMPTY_PROGRESS;
  const answered: Record<string, AnsweredQuestion> = {};
  for (const q of questions) {
    const response = responses.get(q.id);
    if (!response) continue;
    if (response.result) progress = advance(progress, response.result);
    answered[q.id] = {
      answer: response.answer,
      outcome: response.result
        ? outcomeFor(policy, q, { result: response.result, points: response.points }, progress, 0)
        : undefined,
    };
  }
  return { answered, progress };
}

/** Progress over answered questions, walking them in attempt order. */
export function progressInOrder(
  questionIds: string[],
  results: Map<string, ScoreResult>,
): Progress {
  let progress = EMPTY_PROGRESS;
  for (const id of questionIds) {
    const result = results.get(id);
    if (result) progress = advance(progress, result);
  }
  return progress;
}

/** A summary with everything but the question count removed, for results released later. */
export function withheldSummary(summary: AttemptSummary): AttemptSummary {
  return {
    withheld: true,
    score: 0,
    maxScore: 0,
    percent: 0,
    xp: 0,
    maxStreak: 0,
    correctCount: 0,
    questionCount: summary.questionCount,
    review: [],
    canRetry: summary.canRetry,
  };
}

export function summarize({
  snapshot,
  questionIds,
  seed,
  policy,
  responses,
  canRetry,
}: {
  snapshot: Snapshot;
  questionIds: string[];
  seed: number;
  policy: Policy;
  responses: Map<string, StoredResponse>;
  canRetry: boolean;
}): AttemptSummary {
  const questions = questionsInOrder(snapshot, questionIds);
  const score = questions.reduce((sum, q) => sum + (responses.get(q.id)?.points ?? 0), 0);
  const maxScore = questions.reduce((sum, q) => sum + q.points, 0);
  const results = questions
    .map((q) => responses.get(q.id)?.result)
    .filter((r): r is ScoreResult => !!r);
  const progress = progressOf(results);

  const review: ReviewItem[] = questions.map((q) => {
    const response = responses.get(q.id);
    return {
      questionId: q.id,
      prompt: q.prompt,
      type: q.type,
      data: toPlayQuestion(q, seed, policy).data,
      answer: response?.answer ?? null,
      result: response?.result ?? null,
      ...(policy.showCorrectAnswer && { reveal: { config: q.config, explanation: q.explanation } }),
    };
  });

  return {
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    xp: policy.gamification ? progress.xp : 0,
    maxStreak: policy.gamification ? progress.maxStreak : 0,
    correctCount: results.filter((r) => r.ratio === 1).length,
    questionCount: questions.length,
    review,
    canRetry,
  };
}
