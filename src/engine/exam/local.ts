import type { Policy } from "@/engine/policy";
import {
  gradeAnswer,
  planAttempt,
  questionsInOrder,
  toPlayQuestion,
  type Graded,
} from "@/engine/practice/attempt";
import { nicknameSchema } from "@/engine/practice/nickname";
import type { Snapshot } from "@/engine/practice/snapshot";
import { randomSeed } from "@/lib/seed-random";
import {
  walkStory,
  type BranchingConfig,
  type BranchingPublic,
} from "@/questions/branching/definition";

import { examQuestions, examResult } from "./attempt";
import { examDeadline } from "./deadline";
import type { IntegrityEvent } from "./integrity";
import type { ExamAdapter, ExamResult } from "./types";

type LocalAttempt = {
  id: string;
  no: number;
  seed: number;
  questionIds: string[];
  deadline: number | null;
  status: "in_progress" | "submitted" | "expired";
  submittedAt: string | null;
  responses: Map<string, Graded>;
};

const GRACE_MS = 5000;

/**
 * An in-memory exam engine with the same rules as the Server Actions (deadline + grace,
 * passcode, roster, node-by-node stories) — for the playground and UI tests, no database.
 */
export function createLocalExamAdapter(
  snapshot: Snapshot,
  policy: Policy,
  {
    closesAt = null,
    roster = [],
    latencyMs = 150,
    onIntegrity,
  }: {
    closesAt?: number | null;
    /** Identifiers accepted when policy.access is "roster". */
    roster?: { name: string; identifier: string }[];
    latencyMs?: number;
    onIntegrity?: (events: IntegrityEvent[]) => void;
  } = {},
): ExamAdapter {
  const participants = new Map<string, { name: string; attempts: LocalAttempt[] }>();
  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs));
  const late = (a: LocalAttempt) => a.deadline !== null && Date.now() > a.deadline + GRACE_MS;

  function answersOf(a: LocalAttempt) {
    return Object.fromEntries([...a.responses].map(([id, r]) => [id, r.answer]));
  }

  function close(a: LocalAttempt) {
    if (a.status !== "in_progress") return;
    a.status = late(a) ? "expired" : "submitted";
    a.submittedAt = new Date(late(a) ? a.deadline! : Date.now()).toISOString();
  }

  function resultOf(a: LocalAttempt, attemptsUsed: number): ExamResult {
    const questions = questionsInOrder(snapshot, a.questionIds);
    const maxScore = questions.reduce((s, q) => s + q.points, 0);
    const score = [...a.responses.values()].reduce((s, r) => s + r.points, 0);
    return examResult({
      attempt: {
        attempt_no: a.no,
        status: a.status as "submitted" | "expired",
        submitted_at: a.submittedAt,
        question_ids: a.questionIds,
        seed: a.seed,
        score,
        max_score: maxScore,
      },
      snapshot,
      policy,
      responses: a.responses,
      released: policy.releaseResults === "immediately",
      canRetry: policy.attempts === 0 || attemptsUsed < policy.attempts,
    });
  }

  function openAttempt(token: string, attemptId: string) {
    const a = participants.get(token)?.attempts.find((x) => x.id === attemptId);
    if (!a) return { ok: false as const, error: "not_found" as const };
    if (a.status !== "in_progress") return { ok: false as const, error: "attempt_closed" as const };
    if (late(a)) return { ok: false as const, error: "deadline_passed" as const };
    return { ok: true as const, attempt: a };
  }

  return {
    async join({ nickname, identifier, passcode }) {
      await wait();
      if (policy.passcode && passcode?.trim() !== policy.passcode) {
        return { ok: false, error: "passcode" };
      }
      let name: string;
      if (policy.access === "roster") {
        const entry = roster.find(
          (r) => r.identifier.toLowerCase() === identifier?.trim().toLowerCase(),
        );
        if (!entry) return { ok: false, error: "not_on_roster" };
        name = entry.name;
      } else if (policy.access === "login") {
        return { ok: false, error: "login_required" };
      } else {
        const parsed = nicknameSchema.safeParse(nickname ?? "");
        if (!parsed.success) return { ok: false, error: "invalid" };
        name = parsed.data;
      }
      const token = crypto.randomUUID();
      participants.set(token, { name, attempts: [] });
      return { ok: true, token, nickname: name, otherDevice: false };
    },

    async start(token, options) {
      await wait();
      const p = participants.get(token);
      if (!p) return { ok: false, error: "unauthorized" };
      const latest = p.attempts.at(-1);
      if (latest?.status === "in_progress" && late(latest)) close(latest);
      if (latest?.status === "in_progress") {
        return {
          ok: true,
          exam: {
            attemptId: latest.id,
            attemptNo: latest.no,
            questions: examQuestions(
              snapshot,
              latest.questionIds,
              latest.seed,
              policy,
              answersOf(latest),
            ),
            answers: answersOf(latest),
            deadline: latest.deadline ? new Date(latest.deadline).toISOString() : null,
            serverNow: new Date().toISOString(),
          },
        };
      }
      if (latest && !options?.again)
        return { ok: true, result: resultOf(latest, p.attempts.length) };
      if (closesAt !== null && Date.now() >= closesAt)
        return { ok: false, error: "session_closed" };
      if (policy.attempts > 0 && p.attempts.length >= policy.attempts) {
        return { ok: false, error: "attempt_limit" };
      }
      const seed = randomSeed();
      const attempt: LocalAttempt = {
        id: crypto.randomUUID(),
        no: p.attempts.length + 1,
        seed,
        questionIds: planAttempt(snapshot, policy, seed).questionIds,
        deadline: examDeadline({ startedAt: Date.now(), durationS: policy.timer.totalS, closesAt }),
        status: "in_progress",
        submittedAt: null,
        responses: new Map(),
      };
      p.attempts.push(attempt);
      return {
        ok: true,
        exam: {
          attemptId: attempt.id,
          attemptNo: attempt.no,
          questions: examQuestions(snapshot, attempt.questionIds, seed, policy, {}),
          answers: {},
          deadline: attempt.deadline ? new Date(attempt.deadline).toISOString() : null,
          serverNow: new Date().toISOString(),
        },
      };
    },

    async save(token, attemptId, questionId, raw) {
      await wait();
      const open = openAttempt(token, attemptId);
      if (!open.ok) return open;
      const q = questionsInOrder(snapshot, open.attempt.questionIds).find(
        (x) => x.id === questionId,
      );
      if (!q) return { ok: false, error: "not_found" };
      const graded = gradeAnswer(q, raw);
      if (!graded) return { ok: false, error: "invalid" };
      open.attempt.responses.set(questionId, graded);
      return { ok: true };
    },

    async storyStep(token, attemptId, questionId, path) {
      await wait();
      const open = openAttempt(token, attemptId);
      if (!open.ok) return open;
      const q = questionsInOrder(snapshot, open.attempt.questionIds).find(
        (x) => x.id === questionId,
      );
      if (!q || q.type !== "branching") return { ok: false, error: "not_found" };
      if (!walkStory(q.config as BranchingConfig, path)) return { ok: false, error: "invalid" };
      const data = toPlayQuestion(q, open.attempt.seed, policy, path).data as BranchingPublic;
      return { ok: true, nodes: data.nodes };
    },

    async logIntegrity(_token, _attemptId, events) {
      onIntegrity?.(events);
      return { ok: true };
    },

    async finish(token, attemptId) {
      await wait();
      const p = participants.get(token);
      const a = p?.attempts.find((x) => x.id === attemptId);
      if (!p || !a) return { ok: false, error: "not_found" };
      close(a);
      return { ok: true, result: resultOf(a, p.attempts.length) };
    },
  };
}
