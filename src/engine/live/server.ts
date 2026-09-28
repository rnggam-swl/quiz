import "server-only";

import { loadSnapshot } from "@/engine/practice/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { createClient } from "@/lib/supabase/server";

import type { Snapshot } from "@/engine/practice/snapshot";
import { broadcast } from "@/engine/transport/broadcast";
import { liveSigningKey } from "@/engine/transport/keys";

import { signState } from "./signed";
import type { HostView, PlayerView, RawLiveState } from "./types";
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
  if (raw.phase === "lobby") {
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

// A session's published version never changes, so answering needn't look it up again.
const versionCache = new Map<string, string>();

export async function sessionVersion(sessionId: string): Promise<string | null> {
  const cached = versionCache.get(sessionId);
  if (cached) return cached;
  const { data } = await createAdminClient()
    .from("sessions")
    .select("quiz_version_id")
    .eq("id", sessionId)
    .eq("mode", "live")
    .maybeSingle();
  if (!data?.quiz_version_id) return null;
  if (versionCache.size > 500) versionCache.delete(versionCache.keys().next().value!);
  versionCache.set(sessionId, data.quiz_version_id);
  return data.quiz_version_id;
}
