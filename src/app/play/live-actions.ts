"use server";

import { loadPlayerView, sessionVersion } from "@/engine/live/server";
import type { PlayerView } from "@/engine/live/types";
import { gradeAnswer } from "@/engine/practice/attempt";
import { nicknameSchema } from "@/engine/practice/nickname";
import { loadSnapshot } from "@/engine/practice/server";
import type { Result } from "@/engine/practice/types";
import { getParticipantTokenSecret } from "@/lib/env.server";
import { signParticipantToken } from "@/lib/participant-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { participantFrom, rpcError, uuid } from "./participant";

// Live endpoints for the phones (docs/09-mode-live.md). Public like the other player
// actions: every argument is untrusted and participants are known only by their token.
// Scoring runs here, timing and points in the database.

export async function joinLiveAction(
  sessionId: string,
  nickname: string,
): Promise<Result<{ token: string; nickname: string }>> {
  if (!uuid.safeParse(sessionId).success) return { ok: false, error: "not_found" };
  const parsed = nicknameSchema.safeParse(nickname);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const { data, error } = await createAdminClient().rpc("join_live", {
    p_session_id: sessionId,
    p_nickname: parsed.data,
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

export async function liveStateAction(token: string): Promise<Result<{ view: PlayerView }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  const view = await loadPlayerView(claims.sessionId, claims.participantId);
  if (!view) return { ok: false, error: "not_found" };
  return { ok: true, view };
}

export async function answerLiveAction(
  token: string,
  questionId: string,
  answer: unknown,
): Promise<Result<object>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "not_found" };
  const versionId = await sessionVersion(claims.sessionId);
  const snapshot = versionId ? await loadSnapshot(versionId) : null;
  const q = snapshot?.questions.find((x) => x.id === questionId);
  if (!q) return { ok: false, error: "not_found" };
  const graded = gradeAnswer(q, answer);
  if (!graded) return { ok: false, error: "invalid" };

  const { error } = await createAdminClient().rpc("record_live_answer", {
    p_participant_id: claims.participantId,
    p_question_id: q.id,
    p_answer: graded.answer as Json,
    // Types graded by hand aren't offered in live sessions; score them as unscored.
    p_correct: graded.result?.correct ?? 0,
    p_total: graded.result?.total ?? 0,
    p_base_points: q.points,
  });
  return error ? { ok: false, error: rpcError(error.message) } : { ok: true };
}
