import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { bearerToken, hashApiToken } from "@/lib/api-token";
import { createAdminClient } from "@/lib/supabase/admin";

// Shared plumbing for the read-only REST API (P8-07, docs/02-architecture.md#api-rest).

type Admin = ReturnType<typeof createAdminClient>;

const HEADERS = { "Cache-Control": "no-store" };

export function apiError(status: number, code: string, message: string, headers?: HeadersInit) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { ...HEADERS, ...headers } },
  );
}

export function apiJson(body: unknown) {
  return NextResponse.json(body, { headers: HEADERS });
}

export const notFound = () => apiError(404, "not_found", "Tidak ditemukan.");

export function isUuid(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

/**
 * Resolve the bearer token to its owner, then run `handler` for that owner. The api_*
 * RPCs take the owner and filter on it, so handlers never query tables directly.
 */
export async function withOwner(
  request: NextRequest,
  handler: (owner: string, admin: Admin) => Promise<Response>,
): Promise<Response> {
  const token = bearerToken(request.headers.get("authorization"));
  const challenge = { "WWW-Authenticate": 'Bearer realm="quiz"' };
  if (!token) {
    return apiError(
      401,
      "unauthorized",
      "Kirim header Authorization: Bearer <token API>.",
      challenge,
    );
  }
  const admin = createAdminClient();
  const { data: owner, error } = await admin.rpc("api_authenticate", {
    p_token_hash: hashApiToken(token),
  });
  if (error) return apiError(500, "internal", "Terjadi kesalahan. Coba lagi.");
  if (!owner) {
    return apiError(
      401,
      "invalid_token",
      "Token tidak dikenal, sudah dicabut, atau kedaluwarsa.",
      challenge,
    );
  }
  try {
    return await handler(owner, admin);
  } catch {
    return apiError(500, "internal", "Terjadi kesalahan. Coba lagi.");
  }
}
