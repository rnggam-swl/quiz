import { randomBytes } from "node:crypto";

import { z } from "zod";

import { b64url, fromB64url, hmacSha256, parseJson, signaturesMatch } from "./signed-token";

/**
 * Embed tokens are HS256 JWTs signed by the embedding site's server with the
 * quiz's embed secret (docs/07-embed.md#identitas-pengguna). They tell us who
 * the learner is on their site, so reports show real names and attempt limits
 * apply per person.
 */
export const EMBED_TOKEN_MAX_TTL_S = 3600;
const CLOCK_SKEW_S = 60;

const headerSchema = z.object({ alg: z.literal("HS256"), typ: z.string().optional() });

const claimsSchema = z.object({
  sub: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(80).optional(),
  quiz: z.string().min(1),
  exp: z.number().int(),
  iat: z.number().int().optional(),
});
export type EmbedClaims = { externalId: string; name: string | null };

export type EmbedTokenError = "malformed" | "signature" | "wrong_quiz" | "expired" | "too_long";

export function generateEmbedSecret(): string {
  return b64url(randomBytes(32));
}

/** Verify an embed token for a quiz slug. Only HS256 is accepted (never `alg: none`). */
export function verifyEmbedToken(
  secret: string,
  token: string,
  quizSlug: string,
  now = Date.now(),
): { ok: true; claims: EmbedClaims } | { ok: false; error: EmbedTokenError } {
  const parts = token.split(".");
  if (parts.length !== 3 || token.length > 4000) return { ok: false, error: "malformed" };
  const [header, payload, signature] = parts as [string, string, string];

  if (!headerSchema.safeParse(parseJson(fromB64url(header))).success) {
    return { ok: false, error: "malformed" };
  }
  if (!signaturesMatch(hmacSha256(secret, `${header}.${payload}`), fromB64url(signature))) {
    return { ok: false, error: "signature" };
  }
  const claims = claimsSchema.safeParse(parseJson(fromB64url(payload)));
  if (!claims.success) return { ok: false, error: "malformed" };

  const nowS = Math.floor(now / 1000);
  const { sub, name, quiz, exp } = claims.data;
  if (quiz !== quizSlug) return { ok: false, error: "wrong_quiz" };
  if (exp + CLOCK_SKEW_S < nowS) return { ok: false, error: "expired" };
  if (exp - nowS > EMBED_TOKEN_MAX_TTL_S + CLOCK_SKEW_S) return { ok: false, error: "too_long" };
  return { ok: true, claims: { externalId: sub, name: name ?? null } };
}

/** Test/demo helper — the same thing the embedding site does on its server. */
export function signEmbedToken(
  secret: string,
  claims: { sub: string; name?: string; quiz: string; exp: number },
): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify(claims));
  return `${header}.${payload}.${b64url(hmacSha256(secret, `${header}.${payload}`))}`;
}
