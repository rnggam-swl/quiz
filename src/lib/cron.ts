import "server-only";

import { NextResponse, type NextRequest } from "next/server";

import { getCronSecret } from "./env.server";
import { signaturesMatch } from "./signed-token";

/**
 * Scheduled jobs (/api/webhooks/dispatch, /api/maintenance/*) accept only
 * `Authorization: Bearer CRON_SECRET`: from pg_cron via pg_net (secret in Vault) or Vercel
 * Cron. Returns the error response to send, or null when the caller is allowed.
 */
export function rejectUnlessCron(request: NextRequest): NextResponse | null {
  const secret = getCronSecret();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET belum diatur." }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  if (!signaturesMatch(Buffer.from(`Bearer ${secret}`), given)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return null;
}
