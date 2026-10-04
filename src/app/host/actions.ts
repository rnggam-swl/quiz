"use server";

import { z } from "zod";

import { broadcastShared, hostViewFrom, loadLiveRaw } from "@/engine/live/server";
import type { HostAction, HostView } from "@/engine/live/types";
import type { Result } from "@/engine/practice/types";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhooksAfterResponse } from "@/lib/webhooks/dispatch";

// The projector's controls (docs/09-mode-live.md). They run as the signed-in host:
// RLS and the owner-checked RPCs keep them to the host's own sessions. After each
// change everyone on the channel hears the new state version and refetches.

const uuid = z.uuid();
const actionSchema = z.enum(["next", "auto", "pause", "resume", "end"]);

async function hostClient(sessionId: string) {
  if (!uuid.safeParse(sessionId).success) return null;
  const user = await getSessionUser();
  if (!user || user.isAnonymous) return null;
  return createClient();
}

/**
 * The host's view after a change; when the state moved, the phones first get the signed
 * shared state (in parallel with the host's own extras, so nobody waits on the other).
 */
async function viewAfter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  { changed, kicked }: { changed: boolean; kicked?: string[] } = { changed: false },
): Promise<Result<{ view: HostView }>> {
  const loaded = await loadLiveRaw(supabase, sessionId);
  if (!loaded) return { ok: false, error: "not_found" };
  const [view] = await Promise.all([
    hostViewFrom(supabase, sessionId, loaded.raw, loaded.snapshot),
    changed ? broadcastShared(sessionId, loaded.raw, loaded.snapshot, kicked) : null,
  ]);
  return { ok: true, view };
}

export async function hostLiveStateAction(sessionId: string): Promise<Result<{ view: HostView }>> {
  const supabase = await hostClient(sessionId);
  if (!supabase) return { ok: false, error: "unauthorized" };
  return viewAfter(supabase, sessionId);
}

export async function advanceLiveAction(
  sessionId: string,
  version: number,
  action: HostAction,
): Promise<Result<{ view: HostView }>> {
  const supabase = await hostClient(sessionId);
  const parsed = actionSchema.safeParse(action);
  if (!supabase) return { ok: false, error: "unauthorized" };
  if (!parsed.success || !Number.isSafeInteger(version)) return { ok: false, error: "invalid" };
  // Buka serentak (P8-03): a countdown that has run out opens as of its scheduled end.
  if (parsed.data === "auto") await supabase.rpc("open_due_round", { p_session_id: sessionId });
  // Jeda toleransi (P8-04): a rebutan window still deciding its winner finishes first.
  if (parsed.data === "next" || parsed.data === "auto" || parsed.data === "end") {
    for (let tries = 0; tries < 3; tries++) {
      const { data } = await supabase.rpc("resolve_buzzer_round", { p_session_id: sessionId });
      const result = data as { status: string; waitMs?: number } | null;
      if (result?.status !== "pending") break;
      await new Promise((resolve) => setTimeout(resolve, (result.waitMs ?? 0) + 20));
    }
  }
  // Mode tim (P8-02): whoever has no team yet (didn't pick, or came late) gets one first.
  // Placing them moves the version on by one.
  let current = version;
  if (parsed.data === "next") {
    const { data: placed } = await supabase.rpc("assign_teams", {
      p_session_id: sessionId,
      p_force: true,
    });
    if (placed) current += 1;
  }
  const { data, error } = await supabase.rpc("advance_live", {
    p_session_id: sessionId,
    p_version: current,
    p_action: parsed.data,
  });
  if (error || !data)
    return { ok: false, error: error?.message.includes("no_questions") ? "invalid" : "not_found" };
  // The podium submits everyone's attempt: attempt.submitted webhooks (P8-06).
  if (data.phase === "podium" || data.phase === "ended") dispatchWebhooksAfterResponse();
  return viewAfter(supabase, sessionId, { changed: data.state_version !== version });
}

export async function liveSettingsAction(
  sessionId: string,
  patch: { lobbyLocked?: boolean; autoAdvance?: boolean },
): Promise<Result<{ view: HostView }>> {
  const supabase = await hostClient(sessionId);
  if (!supabase) return { ok: false, error: "unauthorized" };
  const lobbyLocked = typeof patch?.lobbyLocked === "boolean" ? patch.lobbyLocked : undefined;
  const autoAdvance = typeof patch?.autoAdvance === "boolean" ? patch.autoAdvance : undefined;
  const { data, error } = await supabase.rpc("update_live_settings", {
    p_session_id: sessionId,
    ...(lobbyLocked !== undefined && { p_lobby_locked: lobbyLocked }),
    ...(autoAdvance !== undefined && { p_auto_advance: autoAdvance }),
  });
  if (error || !data) return { ok: false, error: "not_found" };
  return viewAfter(supabase, sessionId, { changed: true });
}

/** Mode tim (P8-02): deal everyone out again, in the lobby. */
export async function shuffleTeamsAction(sessionId: string): Promise<Result<{ view: HostView }>> {
  const supabase = await hostClient(sessionId);
  if (!supabase) return { ok: false, error: "unauthorized" };
  const { error } = await supabase.rpc("shuffle_teams", { p_session_id: sessionId });
  if (error) return { ok: false, error: "not_found" };
  return viewAfter(supabase, sessionId, { changed: true });
}

export async function kickParticipantAction(
  sessionId: string,
  participantId: string,
): Promise<Result<{ view: HostView }>> {
  const supabase = await hostClient(sessionId);
  if (!supabase || !uuid.safeParse(participantId).success)
    return { ok: false, error: "unauthorized" };
  const { error } = await supabase.rpc("kick_participant", {
    p_session_id: sessionId,
    p_participant_id: participantId,
  });
  if (error) return { ok: false, error: "not_found" };
  return viewAfter(supabase, sessionId, { changed: true, kicked: [participantId] });
}
