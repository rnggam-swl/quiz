import "server-only";

import { resolvePolicy, type Policy } from "@/engine/policy";
import { verifyEmbedToken, type EmbedClaims } from "@/lib/embed-token";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Tables } from "@/lib/supabase/database.types";

import { parseSnapshot, type Snapshot } from "./snapshot";
import type { PlayInfo } from "./types";

/**
 * Server-side reads for the participant flow. Uses the secret-key client
 * because participants have no Supabase session; every caller must have
 * verified a participant token (or be resolving a public code/slug) first.
 */

// Published versions never change, so they can be cached for the process lifetime.
const snapshotCache = new Map<string, Snapshot>();
const SNAPSHOT_CACHE_MAX = 200;

export async function loadSnapshot(versionId: string): Promise<Snapshot | null> {
  const cached = snapshotCache.get(versionId);
  if (cached) return cached;
  const { data } = await createAdminClient()
    .from("quiz_versions")
    .select("snapshot")
    .eq("id", versionId)
    .maybeSingle();
  const snapshot = data ? parseSnapshot(data.snapshot) : null;
  if (snapshot) {
    if (snapshotCache.size >= SNAPSHOT_CACHE_MAX) {
      snapshotCache.delete(snapshotCache.keys().next().value!);
    }
    snapshotCache.set(versionId, snapshot);
  }
  return snapshot;
}

export type SessionContext = {
  session: Pick<
    Tables<"sessions">,
    "id" | "quiz_id" | "quiz_version_id" | "mode" | "status" | "code" | "opens_at" | "closes_at"
  >;
  policy: Policy;
  quiz: Pick<Tables<"quizzes">, "id" | "slug" | "embed_allowed_origins">;
  /** The version new attempts use: pinned, or the latest published one. */
  versionId: string;
  snapshot: Snapshot;
};

const SESSION_COLUMNS =
  "id, quiz_id, quiz_version_id, mode, status, code, opens_at, closes_at, policy, quizzes!inner(id, slug, embed_allowed_origins)";

async function contextFrom(
  row: (Tables<"sessions"> & { quizzes: SessionContext["quiz"] }) | null,
): Promise<SessionContext | null> {
  if (!row) return null;
  let versionId = row.quiz_version_id;
  if (!versionId) {
    const { data } = await createAdminClient()
      .from("quiz_versions")
      .select("id")
      .eq("quiz_id", row.quiz_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    versionId = data?.id ?? null;
  }
  if (!versionId) return null;
  const snapshot = await loadSnapshot(versionId);
  if (!snapshot) return null;
  const { quizzes, policy, ...session } = row;
  return { session, policy: resolvePolicy(row.mode, policy), quiz: quizzes, versionId, snapshot };
}

export async function loadSessionById(sessionId: string): Promise<SessionContext | null> {
  const { data } = await createAdminClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("id", sessionId)
    .maybeSingle();
  return contextFrom(data as never);
}

/** Active session for a 6-digit join code. */
export async function loadSessionByCode(code: string): Promise<SessionContext | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const { data } = await createAdminClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("code", code)
    .in("status", ["lobby", "running"])
    .maybeSingle();
  return contextFrom(data as never);
}

/** The quiz's default practice session, for /embed/[slug]. */
export async function loadDefaultSessionBySlug(slug: string): Promise<SessionContext | null> {
  const { data: quiz } = await createAdminClient()
    .from("quizzes")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!quiz) return null;
  const { data } = await createAdminClient()
    .from("sessions")
    .select(SESSION_COLUMNS)
    .eq("quiz_id", quiz.id)
    .eq("is_default", true)
    .maybeSingle();
  return contextFrom(data as never);
}

export function isSessionOpen(ctx: SessionContext, now = Date.now()): boolean {
  const { status, opens_at, closes_at } = ctx.session;
  return (
    (status === "running" || status === "lobby") &&
    (!opens_at || Date.parse(opens_at) <= now) &&
    (!closes_at || Date.parse(closes_at) > now)
  );
}

export function playInfo(ctx: SessionContext): PlayInfo {
  const { quiz, questions } = ctx.snapshot;
  return {
    title: quiz.title,
    description: quiz.description,
    coverUrl: quiz.coverUrl,
    theme: quiz.theme,
    questionCount: questions.length,
    policy: {
      feedback: ctx.policy.feedback,
      gamification: ctx.policy.gamification,
      showCorrectAnswer: ctx.policy.showCorrectAnswer,
      attempts: ctx.policy.attempts,
    },
  };
}

/** Verify an embed token against the session's quiz and its embed secret. */
export async function verifyEmbedTokenFor(
  ctx: SessionContext,
  token: string,
): Promise<EmbedClaims | null> {
  if (!ctx.quiz.slug || token.length > 4000) return null;
  const { data } = await createAdminClient()
    .from("quiz_embed_secrets")
    .select("secret")
    .eq("quiz_id", ctx.quiz.id)
    .maybeSingle();
  if (!data) return null;
  const result = verifyEmbedToken(data.secret, token, ctx.quiz.slug);
  return result.ok ? result.claims : null;
}
