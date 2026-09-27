import "server-only";

import { poolCandidates } from "@/engine/practice/attempt";
import { loadSessionById, type SessionContext } from "@/engine/practice/server";

import { examPhase } from "./attempt";
import type { ExamInfo } from "./types";

/** An exam session (by id, in any state — results stay reachable after it closes). */
export async function loadExam(sessionId: string): Promise<SessionContext | null> {
  const ctx = await loadSessionById(sessionId);
  return ctx?.session.mode === "exam" ? ctx : null;
}

export function examInfo(ctx: SessionContext, now = Date.now()): ExamInfo {
  const { policy, snapshot, session } = ctx;
  const pool = policy.questionPool
    ? Math.min(policy.questionPool.size, poolCandidates(snapshot, policy).length)
    : snapshot.questions.length;
  return {
    sessionId: session.id,
    title: session.title?.trim() || snapshot.quiz.title,
    quizTitle: snapshot.quiz.title,
    description: snapshot.quiz.description,
    questionCount: pool,
    durationS: policy.timer.totalS ?? null,
    opensAt: session.opens_at,
    closesAt: session.closes_at,
    phase: examPhase(session, now),
    access: policy.access,
    needsPasscode: !!policy.passcode,
    navigation: policy.navigation,
    integrity: policy.integrity,
    attempts: policy.attempts,
    releaseResults: policy.releaseResults,
    serverNow: new Date(now).toISOString(),
  };
}
