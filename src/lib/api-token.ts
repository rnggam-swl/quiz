import { createHash, randomBytes } from "node:crypto";

// API tokens (P8-07): `qz_` + 32 random bytes (base64url). Only the SHA-256 is stored; a
// slow hash isn't needed for 256 bits of randomness. The prefix is what the UI shows.

const TOKEN_RE = /^qz_[A-Za-z0-9_-]{43}$/;
export const API_TOKEN_PREFIX_LENGTH = 10;

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateApiToken(): { token: string; prefix: string; hash: string } {
  const token = `qz_${randomBytes(32).toString("base64url")}`;
  return { token, prefix: token.slice(0, API_TOKEN_PREFIX_LENGTH), hash: hashApiToken(token) };
}

/** The token from `Authorization: Bearer qz_…`, or null if missing or not shaped like one. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  const token = match?.[1];
  return token && TOKEN_RE.test(token) ? token : null;
}

/** Opaque page cursor for /api/v1 lists: the last row's (started_at, id). */
export function encodeCursor(next: { started_at: string; id: string } | null): string | null {
  return next
    ? Buffer.from(JSON.stringify([next.started_at, next.id])).toString("base64url")
    : null;
}

export function decodeCursor(cursor: string | null): { startedAt: string; id: string } | null {
  if (!cursor || cursor.length > 200) return null;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      !Number.isNaN(Date.parse(value[0])) &&
      typeof value[1] === "string" &&
      /^[0-9a-f-]{36}$/i.test(value[1])
    ) {
      return { startedAt: value[0], id: value[1] };
    }
  } catch {
    // fall through
  }
  return null;
}
