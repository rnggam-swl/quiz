import "server-only";

import { z } from "zod";

import { storedResult, type StoredResponse } from "@/engine/practice/attempt";
import type { PlayError } from "@/engine/practice/types";
import { getParticipantTokenSecret } from "@/lib/env.server";
import { verifyParticipantToken } from "@/lib/participant-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

// Helpers shared by the participant Server Actions (practice, exam and live). They live
// outside the "use server" files so they don't become callable endpoints themselves.

export const uuid = z.uuid();

const RPC_ERRORS = [
  "session_closed",
  "attempt_limit",
  "attempt_closed",
  "already_answered",
  "deadline_passed",
  "not_on_roster",
  "lobby_locked",
  "late_join_closed",
  "kicked",
  "spectator",
  "round_closed",
] as const;

/** RPC exceptions (supabase/migrations) → player errors. */
export function rpcError(message: string | undefined): PlayError {
  for (const code of RPC_ERRORS) if (message?.includes(code)) return code;
  if (message?.includes("not_found") || message?.includes("unknown_question")) return "not_found";
  if (message?.includes("invalid_nickname") || message?.includes("nickname_taken")) {
    return "invalid";
  }
  console.error("participant RPC failed", message);
  return "network";
}

/** The participant a token was signed for, or null if it's missing, forged or expired. */
export function participantFrom(token: unknown) {
  if (typeof token !== "string") return null;
  return verifyParticipantToken(getParticipantTokenSecret(), token);
}

export async function loadResponses(attemptId: string): Promise<Map<string, StoredResponse>> {
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

export type AttemptRow = Tables<"attempts">;

/** The attempt, only if it belongs to the token's participant. */
export async function ownedAttempt(
  participantId: string,
  attemptId: string,
): Promise<AttemptRow | null> {
  if (!uuid.safeParse(attemptId).success) return null;
  const { data } = await createAdminClient()
    .from("attempts")
    .select("*")
    .eq("id", attemptId)
    .eq("participant_id", participantId)
    .maybeSingle();
  return data;
}

/** Clamp a client-reported answer time to something sane. */
export function cleanTimeMs(timeMs: number): number {
  return Number.isFinite(timeMs) ? Math.max(0, Math.min(Math.round(timeMs), 86_400_000)) : 0;
}
