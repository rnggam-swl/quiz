"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { generateApiToken } from "@/lib/api-token";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Integrations on /account/integrations (P8-07). Everything runs as the host, so RLS
// keeps it to their own tokens.

const PAGE = "/account/integrations";
const MAX_ACTIVE_TOKENS = 20;

export type CreateTokenResult = { ok: true; token: string } | { ok: false; error: string };

const tokenSchema = z.object({
  name: z.string().trim().min(1, "Beri nama token.").max(60, "Nama maksimal 60 huruf."),
  expiresInDays: z.union([z.literal(0), z.literal(30), z.literal(90), z.literal(365)]),
});

/** New API token. The token itself is returned once; only its hash is stored. */
export async function createApiTokenAction(input: {
  name: string;
  expiresInDays: number;
}): Promise<CreateTokenResult> {
  await requireHost(PAGE);
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Tidak valid." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  if ((count ?? 0) >= MAX_ACTIVE_TOKENS) {
    return {
      ok: false,
      error: `Maksimal ${MAX_ACTIVE_TOKENS} token aktif. Cabut token yang tidak dipakai.`,
    };
  }

  const { token, prefix, hash } = generateApiToken();
  const days = parsed.data.expiresInDays;
  const { error } = await supabase.from("api_tokens").insert({
    name: parsed.data.name,
    prefix,
    token_hash: hash,
    expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
  });
  if (error) return { ok: false, error: "Token gagal dibuat. Coba lagi." };
  revalidatePath(PAGE);
  return { ok: true, token };
}

export async function revokeApiTokenAction(tokenId: string): Promise<{ ok: boolean }> {
  await requireHost(PAGE);
  const id = z.uuid().parse(tokenId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null);
  revalidatePath(PAGE);
  return { ok: !error };
}
