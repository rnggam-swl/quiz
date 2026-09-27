import type { Policy } from "@/engine/policy";
import { randomSeed } from "@/lib/seed-random";

import {
  answeredState,
  gradeAnswer,
  outcomeFor,
  planAttempt,
  progressInOrder,
  questionsInOrder,
  summarize,
  toPlayQuestion,
  type Graded,
} from "./attempt";
import { nicknameSchema } from "./nickname";
import type { Snapshot } from "./snapshot";
import type { AttemptView, PracticeAdapter } from "./types";

type LocalAttempt = {
  id: string;
  no: number;
  seed: number;
  questionIds: string[];
  done: boolean;
  responses: Map<string, Graded>;
};

/**
 * In-memory PracticeAdapter running the same engine as the server. Used by the
 * in-editor preview (nothing is saved) and the dev playground. Scoring happens
 * in the browser here only because there is nothing to protect.
 */
export function createLocalPracticeAdapter(
  snapshot: Snapshot,
  policy: Policy,
  { latencyMs = 0 }: { latencyMs?: number } = {},
): PracticeAdapter {
  const participants = new Map<string, { nickname: string; attempts: LocalAttempt[] }>();
  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs));

  function view(attempt: LocalAttempt): AttemptView {
    const questions = questionsInOrder(snapshot, attempt.questionIds);
    const { answered, progress } = answeredState(policy, questions, attempt.responses);
    return {
      attemptId: attempt.id,
      attemptNo: attempt.no,
      questions: questions.map((q) => toPlayQuestion(q, attempt.seed, policy)),
      answered,
      progress,
    };
  }

  return {
    async join(nickname) {
      await wait();
      const parsed = nicknameSchema.safeParse(nickname);
      if (!parsed.success) return { ok: false, error: "invalid" };
      const token = crypto.randomUUID();
      participants.set(token, { nickname: parsed.data, attempts: [] });
      return { ok: true, token, nickname: parsed.data };
    },

    async start(token, { resumeOnly = false } = {}) {
      await wait();
      const participant = participants.get(token);
      if (!participant) return { ok: false, error: "unauthorized" };
      let attempt = participant.attempts.find((a) => !a.done);
      if (!attempt && resumeOnly) return { ok: false, error: "no_open_attempt" };
      if (!attempt) {
        if (policy.attempts > 0 && participant.attempts.length >= policy.attempts) {
          return { ok: false, error: "attempt_limit" };
        }
        const seed = randomSeed();
        attempt = {
          id: crypto.randomUUID(),
          no: participant.attempts.length + 1,
          seed,
          questionIds: planAttempt(snapshot, policy, seed).questionIds,
          done: false,
          responses: new Map(),
        };
        participant.attempts.push(attempt);
      }
      return { ok: true, attempt: view(attempt) };
    },

    async answer(token, attemptId, questionId, raw) {
      await wait();
      const attempt = participants.get(token)?.attempts.find((a) => a.id === attemptId);
      if (!attempt) return { ok: false, error: "unauthorized" };
      if (attempt.done) return { ok: false, error: "attempt_closed" };
      const q = questionsInOrder(snapshot, attempt.questionIds).find((x) => x.id === questionId);
      if (!q) return { ok: false, error: "invalid" };
      if (policy.feedback === "instant" && attempt.responses.has(questionId)) {
        return { ok: false, error: "already_answered" };
      }
      const graded = gradeAnswer(q, raw);
      if (!graded) return { ok: false, error: "invalid" };
      attempt.responses.set(questionId, graded);
      const results = new Map(
        [...attempt.responses].flatMap(([id, r]) => (r.result ? [[id, r.result] as const] : [])),
      );
      const progress = progressInOrder(attempt.questionIds, results);
      return { ok: true, outcome: outcomeFor(policy, q, graded, progress) };
    },

    async finish(token, attemptId) {
      await wait();
      const participant = participants.get(token);
      const attempt = participant?.attempts.find((a) => a.id === attemptId);
      if (!participant || !attempt) return { ok: false, error: "unauthorized" };
      attempt.done = true;
      return {
        ok: true,
        summary: summarize({
          snapshot,
          questionIds: attempt.questionIds,
          seed: attempt.seed,
          policy,
          responses: attempt.responses,
          canRetry: policy.attempts === 0 || participant.attempts.length < policy.attempts,
        }),
      };
    },
  };
}
