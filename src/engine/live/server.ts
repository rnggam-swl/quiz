import "server-only";

import { resolvePolicy, type Policy } from "@/engine/policy";
import { loadSnapshot } from "@/engine/practice/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

import type { Snapshot } from "@/engine/practice/snapshot";
import { broadcast } from "@/engine/transport/broadcast";
import { liveSigningKey } from "@/engine/transport/keys";

import { signState } from "./signed";
import {
  GAME_MODES,
  type GameMode,
  type HostView,
  type PlayerView,
  type RawLiveState,
} from "./types";
import { hostView, playerView, sharedView, type LiveAnswer } from "./view";

type HostClient = Awaited<ReturnType<typeof createClient>>;

/** A participant's view, straight from live_state() (one RPC; the snapshot is cached). */
export async function loadPlayerView(
  sessionId: string,
  participantId: string,
): Promise<PlayerView | null> {
  const { data } = await createAdminClient().rpc("live_state", {
    p_session_id: sessionId,
    p_participant_id: participantId,
  });
  const raw = data as RawLiveState | null;
  if (!raw) return null;
  const snapshot = await loadSnapshot(raw.versionId);
  return snapshot ? playerView(raw, snapshot) : null;
}

/** live_state() as the host (RLS: another host's session reads as null) + its snapshot. */
export async function loadLiveRaw(
  supabase: HostClient,
  sessionId: string,
): Promise<{ raw: RawLiveState; snapshot: Snapshot } | null> {
  const { data } = await supabase.rpc("live_state", { p_session_id: sessionId });
  const raw = data as RawLiveState | null;
  if (!raw) return null;
  const snapshot = await loadSnapshot(raw.versionId);
  return snapshot ? { raw, snapshot } : null;
}

/** The projector's view: the lobby adds the participant list, the reveal everyone's answers. */
export async function hostViewFrom(
  supabase: HostClient,
  sessionId: string,
  raw: RawLiveState,
  snapshot: Snapshot,
): Promise<HostView> {
  let roster: HostView["roster"] = [];
  if (raw.mode === "battle_royale") {
    // The projector's avatar grid: who's in, who's out (P7-09).
    const { data: rows } = await supabase
      .from("participants")
      .select("id, nickname, lives, eliminated_round, is_spectator")
      .eq("session_id", sessionId)
      .is("kicked_at", null)
      .order("joined_at")
      .limit(500);
    roster = (rows ?? [])
      .filter((r) =>
        raw.phase === "lobby" ? !r.is_spectator : !r.is_spectator || r.eliminated_round !== null,
      )
      .map((r) => ({
        id: r.id,
        nickname: r.nickname,
        lives: r.lives,
        eliminatedRound: r.eliminated_round,
      }));
  } else if (raw.phase === "lobby") {
    const { data: rows } = await supabase
      .from("participants")
      .select("id, nickname")
      .eq("session_id", sessionId)
      .is("kicked_at", null)
      .eq("is_spectator", false)
      .order("joined_at")
      .limit(500);
    roster = rows ?? [];
  }

  let answers: LiveAnswer[] | null = null;
  if (raw.phase === "reveal" && raw.questionId) {
    const { data: rows } = await supabase
      .from("responses")
      .select("answer, correct, total, attempts!inner(session_id, participants!inner(kicked_at))")
      .eq("attempts.session_id", sessionId)
      .is("attempts.participants.kicked_at", null)
      .eq("question_id", raw.questionId)
      .limit(1000);
    answers = (rows ?? []).map((r) => ({ answer: r.answer, correct: r.correct, total: r.total }));
  }
  return hostView(raw, snapshot, { roster, answers });
}

/** Sign the shared state and broadcast it: the phones use it without fetching. */
export async function broadcastShared(
  sessionId: string,
  raw: RawLiveState,
  snapshot: Snapshot,
  kicked?: string[],
): Promise<void> {
  const signed = await signState(await liveSigningKey(), {
    view: sharedView(raw, snapshot),
    ...(kicked?.length && { kicked }),
  });
  await broadcast(sessionId, { type: "state", version: raw.version, signed });
}

// A session's version, mode and policy never change, so answering needn't look them up again.
export type SessionInfo = { versionId: string; mode: GameMode; policy: Policy };
const infoCache = new Map<string, SessionInfo>();

export async function sessionInfo(sessionId: string): Promise<SessionInfo | null> {
  const cached = infoCache.get(sessionId);
  if (cached) return cached;
  const { data } = await createAdminClient()
    .from("sessions")
    .select("quiz_version_id, mode, policy")
    .eq("id", sessionId)
    .in("mode", GAME_MODES)
    .maybeSingle();
  if (!data?.quiz_version_id) return null;
  const mode = data.mode as GameMode;
  const info = { versionId: data.quiz_version_id, mode, policy: resolvePolicy(mode, data.policy) };
  if (infoCache.size > 500) infoCache.delete(infoCache.keys().next().value!);
  infoCache.set(sessionId, info);
  return info;
}

/** live_state() as the service role, for the participants' side. */
export async function loadServiceRaw(
  sessionId: string,
): Promise<{ raw: RawLiveState; snapshot: Snapshot } | null> {
  const { data } = await createAdminClient().rpc("live_state", { p_session_id: sessionId });
  const raw = data as RawLiveState | null;
  if (!raw) return null;
  const snapshot = await loadSnapshot(raw.versionId);
  return snapshot ? { raw, snapshot } : null;
}
