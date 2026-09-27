"use server";

import { z } from "zod";

import { examPhase, examQuestions, examResult, resultsReleased } from "@/engine/exam/attempt";
import { integrityBatchSchema, type IntegrityEvent } from "@/engine/exam/integrity";
import { loadExam } from "@/engine/exam/server";
import type { ExamResult, ExamView, JoinInput } from "@/engine/exam/types";
import {
  gradeAnswer,
  planAttempt,
  questionsInOrder,
  toPlayQuestion,
} from "@/engine/practice/attempt";
import { nicknameSchema } from "@/engine/practice/nickname";
import { loadSnapshot, type SessionContext } from "@/engine/practice/server";
import type { PlayError, Result } from "@/engine/practice/types";
import { getSessionUser } from "@/lib/auth";
import { getParticipantTokenSecret } from "@/lib/env.server";
import { signParticipantToken } from "@/lib/participant-token";
import { randomSeed } from "@/lib/seed-random";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  MAX_PATH,
  walkStory,
  type BranchingConfig,
  type BranchingPublic,
  type PublicStoryNode,
} from "@/questions/branching/definition";

import {
  cleanTimeMs,
  loadResponses,
  ownedAttempt,
  participantFrom,
  rpcError,
  uuid,
  type AttemptRow,
} from "../play/participant";

// Exam endpoints (docs/08-mode-exam.md). Public like the practice ones: every argument
// is untrusted, participants are known only by the token we signed. Scores stay on the
// server until results are released.

/** The server decides "too late": deadline + 5 s of grace, as in record_response. */
const GRACE_MS = 5000;
const overdue = (attempt: AttemptRow, now = Date.now()) =>
  attempt.deadline !== null && now > Date.parse(attempt.deadline) + GRACE_MS;

const joinSchema = z.object({
  nickname: z.string().max(100).optional(),
  identifier: z.string().trim().min(1).max(120).optional(),
  passcode: z.string().max(100).optional(),
});

export async function joinExamAction(
  sessionId: string,
  input: JoinInput,
): Promise<Result<{ token: string; nickname: string; otherDevice: boolean }>> {
  if (!uuid.safeParse(sessionId).success) return { ok: false, error: "not_found" };
  const ctx = await loadExam(sessionId);
  if (!ctx) return { ok: false, error: "not_found" };
  const phase = examPhase(ctx.session);
  if (phase === "upcoming") return { ok: false, error: "not_open_yet" };
  if (phase === "closed") return { ok: false, error: "session_closed" };

  const parsed = joinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { passcode } = ctx.policy;
  if (passcode && parsed.data.passcode?.trim() !== passcode)
    return { ok: false, error: "passcode" };

  let args: { p_nickname: string; p_identifier?: string; p_user_id?: string };
  if (ctx.policy.access === "roster") {
    if (!parsed.data.identifier) return { ok: false, error: "invalid" };
    args = { p_nickname: "", p_identifier: parsed.data.identifier };
  } else if (ctx.policy.access === "login") {
    const user = await getSessionUser();
    if (!user || user.isAnonymous) return { ok: false, error: "login_required" };
    const { data: profile } = await createAdminClient()
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle();
    const name = profile?.display_name.trim() || user.email?.split("@")[0] || "Peserta";
    args = { p_nickname: name.slice(0, 60), p_user_id: user.id };
  } else {
    const nickname = nicknameSchema.safeParse(parsed.data.nickname ?? "");
    if (!nickname.success) return { ok: false, error: "invalid" };
    args = { p_nickname: nickname.data };
  }

  const admin = createAdminClient();
  const { data: participant, error } = await admin.rpc("join_exam", {
    p_session_id: sessionId,
    ...args,
  });
  if (error || !participant) return { ok: false, error: rpcError(error?.message) };

  // Roster/login joins return the same participant on every device. If an attempt is
  // already running, this is a second device: allowed, but recorded and flagged.
  let otherDevice = false;
  if (ctx.policy.access !== "open") {
    const { data: running } = await admin
      .from("attempts")
      .select("id")
      .eq("participant_id", participant.id)
      .eq("status", "in_progress")
      .maybeSingle();
    if (running) {
      otherDevice = true;
      await admin.rpc("log_integrity_events", {
        p_attempt_id: running.id,
        p_events: [{ kind: "multi_device", at: new Date().toISOString() }] as Json,
      });
    }
  }

  return {
    ok: true,
    nickname: participant.nickname,
    otherDevice,
    token: signParticipantToken(getParticipantTokenSecret(), {
      participantId: participant.id,
      sessionId,
    }),
  };
}

async function examView(ctx: SessionContext, attempt: AttemptRow): Promise<ExamView | null> {
  const snapshot =
    attempt.quiz_version_id === ctx.versionId
      ? ctx.snapshot
      : await loadSnapshot(attempt.quiz_version_id);
  if (!snapshot) return null;
  const responses = await loadResponses(attempt.id);
  const answers = Object.fromEntries([...responses].map(([id, r]) => [id, r.answer]));
  return {
    attemptId: attempt.id,
    attemptNo: attempt.attempt_no,
    questions: examQuestions(
      snapshot,
      attempt.question_ids,
      Number(attempt.seed),
      ctx.policy,
      answers,
    ),
    answers,
    deadline: attempt.deadline,
    serverNow: new Date().toISOString(),
  };
}

async function resultFor(ctx: SessionContext, attempt: AttemptRow): Promise<ExamResult | null> {
  if (attempt.status === "in_progress") return null;
  const [snapshot, responses] = await Promise.all([
    loadSnapshot(attempt.quiz_version_id),
    loadResponses(attempt.id),
  ]);
  if (!snapshot) return null;
  const canRetry =
    examPhase(ctx.session) === "open" &&
    (ctx.policy.attempts === 0 || attempt.attempt_no < ctx.policy.attempts);
  return examResult({
    attempt: { ...attempt, status: attempt.status },
    snapshot,
    policy: ctx.policy,
    responses,
    released: resultsReleased(ctx.policy, ctx.session),
    canRetry,
  });
}

/** Close an attempt (on time → submitted, late → expired) and total its score. */
async function close(
  ctx: SessionContext,
  attempt: AttemptRow,
): Promise<Result<{ result: ExamResult }>> {
  const snapshot = await loadSnapshot(attempt.quiz_version_id);
  if (!snapshot) return { ok: false, error: "not_found" };
  const maxScore = questionsInOrder(snapshot, attempt.question_ids).reduce(
    (s, q) => s + q.points,
    0,
  );
  const { data: done, error } = await createAdminClient().rpc("submit_attempt", {
    p_attempt_id: attempt.id,
    p_max_score: maxScore,
    p_xp: 0,
    p_max_streak: 0,
  });
  if (error || !done) return { ok: false, error: rpcError(error?.message) };
  const result = await resultFor(ctx, done);
  return result ? { ok: true, result } : { ok: false, error: "not_found" };
}

export async function startExamAction(
  token: string,
  options?: { again?: boolean },
): Promise<Result<{ exam: ExamView } | { result: ExamResult }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  const ctx = await loadExam(claims.sessionId);
  if (!ctx) return { ok: false, error: "not_found" };
  const admin = createAdminClient();

  const { data: latest } = await admin
    .from("attempts")
    .select("*")
    .eq("participant_id", claims.participantId)
    .order("attempt_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.status === "in_progress") {
    // Came back after the time ran out (browser closed): close it with what was saved.
    if (overdue(latest)) return close(ctx, latest);
    const exam = await examView(ctx, latest);
    return exam ? { ok: true, exam } : { ok: false, error: "not_found" };
  }
  if (latest && options?.again !== true) {
    const result = await resultFor(ctx, latest);
    return result ? { ok: true, result } : { ok: false, error: "not_found" };
  }

  const phase = examPhase(ctx.session);
  if (phase !== "open")
    return { ok: false, error: phase === "upcoming" ? "not_open_yet" : "session_closed" };
  const seed = randomSeed();
  const plan = planAttempt(ctx.snapshot, ctx.policy, seed);
  const { data: attempt, error } = await admin.rpc("start_attempt", {
    p_participant_id: claims.participantId,
    p_quiz_version_id: ctx.versionId,
    p_seed: seed,
    p_question_ids: plan.questionIds,
    p_max_attempts: ctx.policy.attempts,
    p_duration_s: ctx.policy.timer.totalS,
    p_max_score: plan.maxScore,
  });
  if (error || !attempt) return { ok: false, error: rpcError(error?.message) };
  const exam = await examView(ctx, attempt);
  return exam ? { ok: true, exam } : { ok: false, error: "not_found" };
}

/** An open attempt of the token's participant, with its exam and published version. */
async function openAttempt(token: string, attemptId: string) {
  const claims = participantFrom(token);
  if (!claims) return { ok: false as const, error: "unauthorized" as PlayError };
  const attempt = await ownedAttempt(claims.participantId, attemptId);
  if (!attempt) return { ok: false as const, error: "not_found" as PlayError };
  if (attempt.status !== "in_progress")
    return { ok: false as const, error: "attempt_closed" as PlayError };
  if (overdue(attempt)) return { ok: false as const, error: "deadline_passed" as PlayError };
  const [ctx, snapshot] = await Promise.all([
    loadExam(attempt.session_id),
    loadSnapshot(attempt.quiz_version_id),
  ]);
  if (!ctx || !snapshot) return { ok: false as const, error: "not_found" as PlayError };
  return { ok: true as const, attempt, ctx, snapshot };
}

export async function saveExamAnswerAction(
  token: string,
  attemptId: string,
  questionId: string,
  answer: unknown,
  timeMs: number,
): Promise<Result<object>> {
  const open = await openAttempt(token, attemptId);
  if (!open.ok) return { ok: false, error: open.error };
  const q = questionsInOrder(open.snapshot, open.attempt.question_ids).find(
    (x) => x.id === questionId,
  );
  if (!q) return { ok: false, error: "not_found" };
  const graded = gradeAnswer(q, answer);
  if (!graded) return { ok: false, error: "invalid" };

  const { error } = await createAdminClient().rpc("record_response", {
    p_attempt_id: open.attempt.id,
    p_question_id: q.id,
    p_answer: graded.answer as Json,
    // Null = waiting for manual grading; the generated arg types don't allow null.
    p_correct: graded.result?.correct ?? (null as never),
    p_total: graded.result?.total ?? (null as never),
    p_points: graded.points,
    p_time_ms: cleanTimeMs(timeMs),
    p_allow_change: true,
  });
  return error ? { ok: false, error: rpcError(error.message) } : { ok: true };
}

const pathSchema = z.array(z.string().min(1).max(40)).max(MAX_PATH);

/** The next part of a branching story (exams send stories node by node, P4-07b). */
export async function storyStepAction(
  token: string,
  attemptId: string,
  questionId: string,
  path: string[],
): Promise<Result<{ nodes: PublicStoryNode[] }>> {
  const parsedPath = pathSchema.safeParse(path);
  if (!parsedPath.success) return { ok: false, error: "invalid" };
  const open = await openAttempt(token, attemptId);
  if (!open.ok) return { ok: false, error: open.error };
  const q = questionsInOrder(open.snapshot, open.attempt.question_ids).find(
    (x) => x.id === questionId,
  );
  if (!q || q.type !== "branching") return { ok: false, error: "not_found" };
  // Only real paths through the story unlock nodes.
  if (!walkStory(q.config as BranchingConfig, parsedPath.data))
    return { ok: false, error: "invalid" };
  const data = toPlayQuestion(q, Number(open.attempt.seed), open.ctx.policy, parsedPath.data)
    .data as BranchingPublic;
  return { ok: true, nodes: data.nodes };
}

export async function logIntegrityAction(
  token: string,
  attemptId: string,
  events: IntegrityEvent[],
): Promise<Result<object>> {
  const batch = integrityBatchSchema.safeParse(events);
  if (!batch.success) return { ok: false, error: "invalid" };
  if (batch.data.length === 0) return { ok: true };
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  // Late events (sent right after submitting) are still worth keeping.
  const attempt = await ownedAttempt(claims.participantId, attemptId);
  if (!attempt) return { ok: false, error: "not_found" };
  const { error } = await createAdminClient().rpc("log_integrity_events", {
    p_attempt_id: attempt.id,
    p_events: batch.data as Json,
  });
  return error ? { ok: false, error: rpcError(error.message) } : { ok: true };
}

export async function finishExamAction(
  token: string,
  attemptId: string,
): Promise<Result<{ result: ExamResult }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  const attempt = await ownedAttempt(claims.participantId, attemptId);
  if (!attempt) return { ok: false, error: "not_found" };
  const ctx = await loadExam(attempt.session_id);
  if (!ctx) return { ok: false, error: "not_found" };
  if (attempt.status !== "in_progress") {
    const result = await resultFor(ctx, attempt);
    return result ? { ok: true, result } : { ok: false, error: "not_found" };
  }
  return close(ctx, attempt);
}
