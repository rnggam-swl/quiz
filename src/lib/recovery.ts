import "server-only";

import { getParticipantTokenSecret } from "./env.server";
import { b64url, fromB64url, hmacSha256, parseJson, signaturesMatch } from "./signed-token";

// Password recovery (P8-16). The emailed link signs the person in; this short-lived cookie
// marks that session as "came from the reset email", so /reset-password may set a new
// password without the old one. A normal signed-in session never gets it, so someone at an
// unlocked laptop still needs the current password (on /account) to change it.

export const RECOVERY_COOKIE = "pw_recovery";
export const RECOVERY_TTL_S = 15 * 60;

const LABEL = "password-recovery-v1";

type Payload = { sub: string; exp: number };

function sign(data: string): Buffer {
  return hmacSha256(getParticipantTokenSecret(), `${LABEL}.${data}`);
}

export function createRecoveryMarker(userId: string, now = Date.now()): string {
  const payload = b64url(
    JSON.stringify({ sub: userId, exp: Math.floor(now / 1000) + RECOVERY_TTL_S }),
  );
  return `${payload}.${b64url(sign(payload))}`;
}

/** True when the marker was issued for this user and hasn't expired. */
export function verifyRecoveryMarker(
  marker: string | undefined,
  userId: string,
  now = Date.now(),
): boolean {
  if (!marker) return false;
  const [payload, signature, extra] = marker.split(".");
  if (!payload || !signature || extra !== undefined) return false;
  if (!signaturesMatch(sign(payload), fromB64url(signature))) return false;
  const data = parseJson(fromB64url(payload)) as Partial<Payload> | null;
  return data?.sub === userId && typeof data.exp === "number" && data.exp * 1000 > now;
}

export const recoveryCookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: RECOVERY_TTL_S,
};
