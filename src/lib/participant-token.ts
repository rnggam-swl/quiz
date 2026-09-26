import { z } from "zod";

import { b64url, fromB64url, hmacSha256, parseJson, signaturesMatch } from "./signed-token";

/**
 * Identifies a quiz participant without a Supabase account. Issued by the server
 * when someone joins, kept in localStorage (which also works inside a
 * third-party iframe, unlike our auth cookies) and sent with every action.
 * Format: `pt1.<payload>.<hmac>` — our own format, not a JWT, so it can't be
 * confused with (or accepted as) a Supabase or embed token.
 */
const PREFIX = "pt1";
export const PARTICIPANT_TOKEN_TTL_S = 30 * 24 * 3600;

const payloadSchema = z.object({
  /** participant id */
  p: z.uuid(),
  /** session id */
  s: z.uuid(),
  /** expiry, unix seconds */
  exp: z.number().int(),
});

export type ParticipantClaims = { participantId: string; sessionId: string; expiresAt: number };

export function signParticipantToken(
  secret: string,
  { participantId, sessionId }: { participantId: string; sessionId: string },
  now = Date.now(),
): string {
  const payload = b64url(
    JSON.stringify({
      p: participantId,
      s: sessionId,
      exp: Math.floor(now / 1000) + PARTICIPANT_TOKEN_TTL_S,
    }),
  );
  return `${PREFIX}.${payload}.${b64url(hmacSha256(secret, `${PREFIX}.${payload}`))}`;
}

/** Returns the claims, or null for anything forged, malformed or expired. */
export function verifyParticipantToken(
  secret: string,
  token: string | null | undefined,
  now = Date.now(),
): ParticipantClaims | null {
  if (!token || token.length > 1000) return null;
  const [prefix, payload, signature, ...rest] = token.split(".");
  if (prefix !== PREFIX || !payload || !signature || rest.length) return null;
  if (!signaturesMatch(hmacSha256(secret, `${PREFIX}.${payload}`), fromB64url(signature)))
    return null;

  const parsed = payloadSchema.safeParse(parseJson(fromB64url(payload)));
  if (!parsed.success || parsed.data.exp * 1000 <= now) return null;
  return { participantId: parsed.data.p, sessionId: parsed.data.s, expiresAt: parsed.data.exp };
}
