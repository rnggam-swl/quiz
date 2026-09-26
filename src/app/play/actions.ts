"use server";

import { z } from "zod";

import {
  answeredState,
  gradeAnswer,
  outcomeFor,
  planAttempt,
  progressInOrder,
  questionsInOrder,
  storedResult,
  summarize,
  toPlayQuestion,
  withheldSummary,
  type StoredResponse,
} from "@/engine/practice/attempt";
import { nicknameSchema } from "@/engine/practice/nickname";
import {
  isSessionOpen,
  loadSessionById,
  loadSnapshot,
  verifyEmbedTokenFor,
} from "@/engine/practice/server";
import type {
  AnswerOutcome,
  AttemptSummary,
  AttemptView,
  PlayError,
  Result,
} from "@/engine/practice/types";
import { getParticipantTokenSecret } from "@/lib/env.server";
import { signParticipantToken, verifyParticipantToken } from "@/lib/participant-token";
import { randomSeed } from "@/lib/seed-random";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json, Tables } from "@/lib/supabase/database.types";
import type { ScoreResult } from "@/questions/types";

// These actions are public endpoints: every argument is untrusted. Participants
// are identified only by a participant token we signed (docs/02-architecture.md).

const uuid = z.uuid();

/** RPC exceptions (supabase/migrations/…_practice_sessions.sql) → player errors. */
function rpcError(message: string | undefined): PlayError {
  for (const code of [
    "session_closed",
    "attempt_limit",
    "attempt_closed",
    "already_answered",
    "deadline_passed",
  ] as const) {
    if (message?.includes(code)) return code;
  }
  if (message?.includes("not_found") || message?.includes("unknown_question")) return "not_found";
  if (message?.includes("invalid_nickname") || message?.includes("nickname_taken"))
    return "invalid";
  console.error("practice RPC failed", message);
  return "network";
}

function participantFrom(token: unknown) {
  if (typeof token !== "string") return null;
  return verifyParticipantToken(getParticipantTokenSecret(), token);
}

export async function joinSessionAction(
  sessionId: string,
  nickname: string,
  embedToken?: string | null,
): Promise<Result<{ token: string; nickname: string }>> {
  if (!uuid.safeParse(sessionId).success) return { ok: false, error: "not_found" };
  const ctx = await loadSessionById(sessionId);
  if (!ctx) return { ok: false, error: "not_found" };
  if (!isSessionOpen(ctx)) return { ok: false, error: "session_closed" };

  let externalId: string | null = null;
  let name = nickname;
  if (embedToken) {
    const verified = await verifyEmbedTokenFor(ctx, embedToken);
    if (!verified) return { ok: false, error: "unauthorized" };
    externalId = verified.externalId;
    name = verified.name ?? nickname;
  }
  const parsed = nicknameSchema.safeParse(name);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const { data, error } = await createAdminClient().rpc("join_session", {
    p_session_id: sessionId,
    p_nickname: parsed.data,
    // Omitted (undefined) → the function's default null.
    p_external_id: externalId ?? undefined,
  });
  if (error || !data) return { ok: false, error: rpcError(error?.message) };

  return {
    ok: true,
    nickname: data.nickname,
    token: signParticipantToken(getParticipantTokenSecret(), {
      participantId: data.id,
      sessionId,
    }),
  };
}

type AttemptRow = Tables<"attempts">;

async function loadResponses(attemptId: string): Promise<Map<string, StoredResponse>> {
  const { data } = await createAdminClient()
    .from("responses")
    .select("question_id, answer, correct, total, points")
    .eq("attempt_id", attemptId);
  return new Map(
    (data ?? []).map((r) => [
      r.question_id,
      { answer: r.answer, result: storedResult(r.correct, r.total), points: r.points },
    ]),
  );
}

/** The attempt, only if it belongs to the token's participant. */
async function ownedAttempt(participantId: string, attemptId: string): Promise<AttemptRow | null> {
  if (!uuid.safeParse(attemptId).success) return null;
  const { data } = await createAdminClient()
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("participant_id", participantId)
    .maybeSingle();
  return data;
}

export async function startAttemptAction(
  token: string,
  options?: { resumeOnly?: boolean },
): Promise<Result<{ attempt: AttemptView }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  const ctx = await loadSessionById(claims.sessionId);
  if (!ctx) return { ok: false, error: "not_found" };

  if (options?.resumeOnly === true) {
    const { count } = await createAdminClient()
      .from("attempts")
      .select("id", { count: "exact", head: true })
      .eq("participant_id", claims.participantId)
      .eq("status", "in_progress");
    if (!count) return { ok: false, error: "no_open_attempt" };
  }

  const seed = randomSeed();
  const plan = planAttempt(ctx.snapshot, ctx.policy, seed);
  // Resumes the open attempt if there is one (then our plan is ignored).
  const { data: attempt, error } = await createAdminClient().rpc("start_attempt", {
    p_participant_id: claims.participantId,
    p_quiz_version_id: ctx.versionId,
    p_seed: seed,
    p_question_ids: plan.questionIds,
    p_max_attempts: ctx.policy.attempts,
    p_duration_s: ctx.policy.timer.totalS,
  });
  if (error || !attempt) return { ok: false, error: rpcError(error?.message) };

  const snapshot =
    attempt.quiz_version_id === ctx.versionId
      ? ctx.snapshot
      : await loadSnapshot(attempt.quiz_version_id);
  if (!snapshot) return { ok: false, error: "not_found" };
  const questions = questionsInOrder(snapshot, attempt.question_ids);
  const { answered, progress } = answeredState(
    ctx.policy,
    questions,
    await loadResponses(attempt.id),
  );

  return {
    ok: true,
    attempt: {
      attemptId: attempt.id,
      attemptNo: attempt.attempt_no,
      questions: questions.map((q) => toPlayQuestion(q, Number(attempt.seed), ctx.policy)),
      answered,
      progress,
    },
  };
}

export async function submitAnswerAction(
  token: string,
  attemptId: string,
  questionId: string,
  answer: unknown,
  timeMs: number,
): Promise<Result<{ outcome?: AnswerOutcome }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  const attempt = await ownedAttempt(claims.participantId, attemptId);
  if (!attempt) return { ok: false, error: "not_found" };
  if (attempt.status !== "in_progress") return { ok: false, error: "attempt_closed" };

  const [ctx, snapshot] = await Promise.all([
    loadSessionById(attempt.session_id),
    loadSnapshot(attempt.quiz_version_id),
  ]);
  if (!ctx || !snapshot) return { ok: false, error: "not_found" };
  const q = questionsInOrder(snapshot, attempt.question_ids).find((x) => x.id === questionId);
  if (!q) return { ok: false, error: "not_found" };

  const graded = gradeAnswer(q, answer);
  if (!graded) return { ok: false, error: "invalid" };

  const { error } = await createAdminClient().rpc("record_response", {
    p_attempt_id: attempt.id,
    p_question_id: q.id,
    p_answer: graded.answer as Json,
    p_correct: graded.result.correct,
    p_total: graded.result.total,
    p_points: graded.points,
    p_time_ms: Number.isFinite(timeMs) ? Math.max(0, Math.min(Math.round(timeMs), 86_400_000)) : 0,
    p_allow_change: ctx.policy.feedback !== "instant",
  });
  if (error) return { ok: false, error: rpcError(error.message) };

  if (ctx.policy.feedback !== "instant") return { ok: true };
  const responses = await loadResponses(attempt.id);
  const results = new Map<string, ScoreResult>();
  for (const [id, r] of responses) if (r.result) results.set(id, r.result);
  return {
    ok: true,
    outcome: outcomeFor(ctx.policy, q, graded, progressInOrder(attempt.question_ids, results)),
  };
}

export async function finishAttemptAction(
  token: string,
  attemptId: string,
): Promise<Result<{ summary: AttemptSummary }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  const attempt = await ownedAttempt(claims.participantId, attemptId);
  if (!attempt) return { ok: false, error: "not_found" };

  const [ctx, snapshot, responses] = await Promise.all([
    loadSessionById(attempt.session_id),
    loadSnapshot(attempt.quiz_version_id),
    loadResponses(attempt.id),
  ]);
  if (!ctx || !snapshot) return { ok: false, error: "not_found" };

  const summaryInput = {
    snapshot,
    questionIds: attempt.question_ids,
    seed: Number(attempt.seed),
    policy: ctx.policy,
    responses,
  };
  const draft = summarize({ ...summaryInput, canRetry: false });
  const { data: done, error } = await createAdminClient().rpc("submit_attempt", {
    p_attempt_id: attempt.id,
    p_max_score: draft.maxScore,
    p_xp: draft.xp,
    p_max_streak: draft.maxStreak,
  });
  if (error || !done) return { ok: false, error: rpcError(error?.message) };

  const canRetry =
    isSessionOpen(ctx) && (ctx.policy.attempts === 0 || done.attempt_no < ctx.policy.attempts);
  const summary = summarize({ ...summaryInput, canRetry });
  // Results the policy holds back (exams, P4) stay on the server for now.
  if (ctx.policy.releaseResults !== "immediately") {
    return { ok: true, summary: withheldSummary(summary) };
  }
  return { ok: true, summary };
}
