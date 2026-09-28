"use server";

import { z } from "zod";

import { loadHostView } from "@/engine/live/server";
import type { HostAction, HostView } from "@/engine/live/types";
import type { Result } from "@/engine/practice/types";
import { broadcast } from "@/engine/transport/broadcast";
import { getSessionUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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

async function viewAfter(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sessionId: string,
  changedTo: number | null,
): Promise<Result<{ view: HostView }>> {
  if (changedTo !== null) await broadcast(sessionId, { type: "state", version: changedTo });
  const view = await loadHostView(supabase, sessionId);
  return view ? { ok: true, view } : { ok: false, error: "not_found" };
}

export async function hostLiveStateAction(sessionId: string): Promise<Result<{ view: HostView }>> {
  const supabase = await hostClient(sessionId);
  if (!supabase) return { ok: false, error: "unauthorized" };
  return viewAfter(supabase, sessionId, null);
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
  const { data, error } = await supabase.rpc("advance_live", {
    p_session_id: sessionId,
    p_version: version,
    p_action: parsed.data,
  });
  if (error || !data)
    return { ok: false, error: error?.message.includes("no_questions") ? "invalid" : "not_found" };
  return viewAfter(supabase, sessionId, data.state_version !== version ? data.state_version : null);
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
  return viewAfter(supabase, sessionId, data.state_version);
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
  const { data } = await supabase
    .from("sessions")
    .select("state_version")
    .eq("id", sessionId)
    .maybeSingle();
  return viewAfter(supabase, sessionId, data?.state_version ?? null);
}
