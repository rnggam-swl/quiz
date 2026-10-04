"use server";

import {
  broadcastShared,
  loadPlayerView,
  loadServiceRaw,
  sessionInfo,
  type SessionInfo,
} from "@/engine/live/server";
import type { BattleOutcome, PlayerView } from "@/engine/live/types";
import { gradeAnswer, type Graded } from "@/engine/practice/attempt";
import { nicknameSchema } from "@/engine/practice/nickname";
import { loadSnapshot } from "@/engine/practice/server";
import type { Snapshot, SnapshotQuestion } from "@/engine/practice/snapshot";
import type { PlayError, Result } from "@/engine/practice/types";
import { getParticipantTokenSecret } from "@/lib/env.server";
import { signParticipantToken } from "@/lib/participant-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

import { z } from "zod";

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
  // Mode tim, "otomatis": straight into the smallest team (P8-02).
  await createAdminClient().rpc("assign_teams", { p_session_id: sessionId });
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
  clientMs?: number,
): Promise<Result<{ outcome?: BattleOutcome }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "not_found" };
  const info = await sessionInfo(claims.sessionId);
  const snapshot = info ? await loadSnapshot(info.versionId) : null;
  const q = snapshot?.questions.find((x) => x.id === questionId);
  if (!info || !snapshot || !q) return { ok: false, error: "not_found" };
  const graded = gradeAnswer(q, answer);
  if (!graded) return { ok: false, error: "invalid" };

  if (info.mode === "battle_buzzer") {
    const reaction = z.number().int().min(0).max(600_000).safeParse(clientMs);
    return answerBuzzer(claims, info, snapshot, q, graded, reaction.success ? reaction.data : null);
  }

  // Live and royale: the verdict waits for the reveal (royale spectators score shadow points).
  const rpc = info.mode === "battle_royale" ? "record_royale_answer" : "record_live_answer";
  const record = () =>
    createAdminClient().rpc(rpc, {
      p_participant_id: claims.participantId,
      p_question_id: q.id,
      p_answer: graded.answer as Json,
      // Types graded by hand aren't offered in live sessions; score them as unscored.
      p_correct: graded.result?.correct ?? 0,
      p_total: graded.result?.total ?? 0,
      p_base_points: q.points,
    });
  let { error } = await record();
  if (
    error &&
    rpcError(error.message) === "round_closed" &&
    (await openIfDue(claims.sessionId, snapshot))
  ) {
    ({ error } = await record());
  }
  return error ? { ok: false, error: rpcError(error.message) } : { ok: true };
}

/** Mode tim "pilih sendiri" (P8-02): join a team in the lobby. */
export async function chooseTeamAction(token: string, teamId: string): Promise<Result<object>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  if (!uuid.safeParse(teamId).success) return { ok: false, error: "not_found" };
  const { error } = await createAdminClient().rpc("choose_team", {
    p_participant_id: claims.participantId,
    p_team_id: teamId,
  });
  if (error) return { ok: false, error: rpcError(error.message) };
  const info = await sessionInfo(claims.sessionId);
  const snapshot = info ? await loadSnapshot(info.versionId) : null;
  const loaded = snapshot ? await loadServiceRaw(claims.sessionId) : null;
  if (snapshot && loaded) await broadcastShared(claims.sessionId, loaded.raw, snapshot);
  return { ok: true };
}

/**
 * Rebutan "Pencet lalu Jawab" (P8-01): take the buzzer. The database gives it to one phone
 * at a time; everyone else sees who is answering from the broadcast.
 */
export async function buzzLiveAction(
  token: string,
  questionId: string,
): Promise<Result<{ expiresAt: string }>> {
  const claims = participantFrom(token);
  if (!claims) return { ok: false, error: "unauthorized" };
  if (!uuid.safeParse(questionId).success) return { ok: false, error: "not_found" };
  const info = await sessionInfo(claims.sessionId);
  if (!info || info.mode !== "battle_buzzer") return { ok: false, error: "not_found" };
  const snapshot = await loadSnapshot(info.versionId);
  if (!snapshot) return { ok: false, error: "not_found" };

  const press = () =>
    createAdminClient().rpc("buzz_in", {
      p_participant_id: claims.participantId,
      p_question_id: questionId,
    });
  let { data, error } = await press();
  const early = !error && (data as { reason?: string } | null)?.reason === "round_closed";
  if (early && (await openIfDue(claims.sessionId, snapshot))) ({ data, error } = await press());
  if (error) return { ok: false, error: rpcError(error.message) };
  const result = data as { accepted: boolean; reason?: PlayError; expiresAt?: string };
  if (!result.accepted) return { ok: false, error: result.reason ?? "round_closed" };
  const loaded = await loadServiceRaw(claims.sessionId);
  if (loaded) await broadcastShared(claims.sessionId, loaded.raw, snapshot);
  return { ok: true, expiresAt: result.expiresAt! };
}

/**
 * Buka serentak (P8-03): phones show the question when the countdown ends by the server
 * clock, so an answer can arrive before the host's timer has opened the round. Open it
 * now (as of the scheduled moment) and tell everyone; the caller then tries once more.
 */
async function openIfDue(sessionId: string, snapshot: Snapshot): Promise<boolean> {
  const { data: opened } = await createAdminClient().rpc("open_due_round", {
    p_session_id: sessionId,
  });
  if (!opened) return false;
  const loaded = await loadServiceRaw(sessionId);
  if (loaded) await broadcastShared(sessionId, loaded.raw, snapshot);
  return true;
}

type RpcOutcome = {
  accepted: boolean;
  pending?: boolean;
  resolveInMs?: number;
  roundId?: string;
  won?: boolean;
  correct?: boolean;
  points?: number;
  reason?: "round_closed" | "deadline_passed" | "already_answered" | "not_holding" | "hold_expired";
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Jeda toleransi (P8-04): close a grace window once it's over (waiting if it isn't yet)
 * and tell everyone who won. Several answers may try at once; only one resolves it.
 */
async function settleBuzzer(sessionId: string, snapshot: Snapshot): Promise<void> {
  for (let tries = 0; tries < 3; tries++) {
    const { data } = await createAdminClient().rpc("resolve_buzzer_round", {
      p_session_id: sessionId,
    });
    const result = data as { status: string; waitMs?: number } | null;
    if (result?.status === "pending") {
      await sleep((result.waitMs ?? 0) + 20);
      continue;
    }
    if (result?.status === "resolved") {
      const loaded = await loadServiceRaw(sessionId);
      if (loaded) await broadcastShared(sessionId, loaded.raw, snapshot);
    }
    return;
  }
}

/**
 * Rebutan (docs/10 · Menentukan pemenang): the database decides who was first. A winning
 * answer has already moved the session to the reveal, so the winner's request tells
 * everyone at once — the signed state carries the winner.
 */
async function answerBuzzer(
  claims: { participantId: string; sessionId: string },
  info: SessionInfo,
  snapshot: Snapshot,
  q: SnapshotQuestion,
  graded: Graded,
  clientMs: number | null,
): Promise<Result<{ outcome?: BattleOutcome }>> {
  const correct = (graded.result?.ratio ?? 0) >= 1;
  const record = () =>
    createAdminClient().rpc("record_battle_answer", {
      p_participant_id: claims.participantId,
      p_question_id: q.id,
      p_answer: graded.answer as Json,
      p_correct: correct,
      p_points: q.points,
      p_penalty: info.policy.buzzer.wrongPenalty,
      ...(clientMs !== null && { p_client_ms: clientMs }),
    });
  let { data, error } = await record();
  const closed =
    (error && rpcError(error.message) === "round_closed") ||
    (!error && (data as RpcOutcome | null)?.reason === "round_closed");
  if (closed && (await openIfDue(claims.sessionId, snapshot))) ({ data, error } = await record());
  if (error) return { ok: false, error: rpcError(error.message) };
  const outcome = data as RpcOutcome;
  if (!outcome.accepted) return { ok: false, error: outcome.reason ?? "round_closed" };
  if (outcome.pending && outcome.roundId) {
    // A candidate in the grace window: the verdict comes when the window closes.
    await sleep((outcome.resolveInMs ?? 0) + 20);
    await settleBuzzer(claims.sessionId, snapshot);
    const admin = createAdminClient();
    const [{ data: winner }, { data: mine }] = await Promise.all([
      admin
        .from("round_winners")
        .select("participant_id")
        .eq("round_id", outcome.roundId)
        .maybeSingle(),
      admin
        .from("battle_answers")
        .select("points")
        .eq("round_id", outcome.roundId)
        .eq("participant_id", claims.participantId)
        .maybeSingle(),
    ]);
    const won = winner?.participant_id === claims.participantId;
    return { ok: true, outcome: { won, correct: true, points: won ? (mine?.points ?? 0) : 0 } };
  }
  // A win ends the round; in the buzz variant a wrong answer frees the buzzer. Either way
  // every screen should know at once.
  if (outcome.won || info.policy.buzzer.variant === "buzz_then_answer") {
    const loaded = await loadServiceRaw(claims.sessionId);
    if (loaded) await broadcastShared(claims.sessionId, loaded.raw, snapshot);
  }
  return {
    ok: true,
    outcome: { won: !!outcome.won, correct: !!outcome.correct, points: outcome.points ?? 0 },
  };
}
