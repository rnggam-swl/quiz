"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { generateApiToken } from "@/lib/api-token";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dispatchWebhooks } from "@/lib/webhooks/dispatch";
import { generateWebhookSecret } from "@/lib/webhooks/signing";
import { allowLocalWebhooks, checkWebhookUrl } from "@/lib/webhooks/url";

// Integrations on /account/integrations (P8-06, P8-07). Everything runs as the host, so RLS
// keeps it to their own tokens and webhooks.

const PAGE = "/account/integrations";
const MAX_ACTIVE_TOKENS = 20;
const MAX_WEBHOOKS = 5;

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

// ─── Webhooks (P8-06) ─────────────────────────────────────────────────────────

type Done = { ok: true } | { ok: false; error: string };

const webhookSchema = z.object({
  url: z.string().trim().min(1, "Isi URL.").max(500, "URL terlalu panjang."),
  description: z.string().trim().max(100, "Keterangan maksimal 100 huruf."),
});

export async function createWebhookAction(input: {
  url: string;
  description: string;
}): Promise<Done> {
  await requireHost(PAGE);
  const parsed = webhookSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Tidak valid." };
  const check = checkWebhookUrl(parsed.data.url, { allowLocal: allowLocalWebhooks });
  if (!check.ok) return { ok: false, error: check.error };

  const supabase = await createClient();
  const { count } = await supabase.from("webhooks").select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_WEBHOOKS) {
    return { ok: false, error: `Maksimal ${MAX_WEBHOOKS} webhook. Hapus yang tidak dipakai.` };
  }
  const { error } = await supabase.from("webhooks").insert({
    url: check.url.toString(),
    description: parsed.data.description,
    secret: generateWebhookSecret(),
  });
  if (error) return { ok: false, error: "Webhook gagal disimpan. Coba lagi." };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function setWebhookActiveAction(webhookId: string, active: boolean): Promise<Done> {
  await requireHost(PAGE);
  const id = z.uuid().parse(webhookId);
  const supabase = await createClient();
  const { error } = await supabase
    .from("webhooks")
    .update({ active: active === true })
    .eq("id", id);
  revalidatePath(PAGE);
  return error ? { ok: false, error: "Gagal menyimpan." } : { ok: true };
}

export async function deleteWebhookAction(webhookId: string): Promise<Done> {
  await requireHost(PAGE);
  const id = z.uuid().parse(webhookId);
  const supabase = await createClient();
  const { error } = await supabase.from("webhooks").delete().eq("id", id);
  revalidatePath(PAGE);
  return error ? { ok: false, error: "Gagal menghapus." } : { ok: true };
}

export async function webhookSecretAction(
  webhookId: string,
  rotate = false,
): Promise<{ ok: true; secret: string } | { ok: false; error: string }> {
  await requireHost(PAGE);
  const id = z.uuid().parse(webhookId);
  const supabase = await createClient();
  if (rotate) {
    const secret = generateWebhookSecret();
    const { error } = await supabase.from("webhooks").update({ secret }).eq("id", id);
    return error ? { ok: false, error: "Secret gagal diganti." } : { ok: true, secret };
  }
  const { data } = await supabase.from("webhooks").select("secret").eq("id", id).maybeSingle();
  return data
    ? { ok: true, secret: data.secret }
    : { ok: false, error: "Webhook tidak ditemukan." };
}

/** Send one delivery now and say how it went. */
async function sendNow(eventId: string | null, deliveryId: string | null) {
  await dispatchWebhooks(10);
  const supabase = await createClient();
  let query = supabase
    .from("webhook_deliveries")
    .select("status, response_status, last_error")
    .limit(1);
  query = eventId ? query.eq("event_id", eventId) : query.eq("id", deliveryId!);
  const { data } = await query.maybeSingle();
  revalidatePath(PAGE);
  if (data?.status === "succeeded") {
    return { ok: true as const, message: `Terkirim (HTTP ${data.response_status}).` };
  }
  const reason = data?.response_status
    ? `HTTP ${data.response_status}`
    : (data?.last_error ?? "belum terkirim");
  return { ok: false as const, error: `Gagal: ${reason}. Akan dicoba lagi otomatis.` };
}

export async function sendTestWebhookAction(
  webhookId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireHost(PAGE);
  const id = z.uuid().parse(webhookId);
  const supabase = await createClient();
  const { data: eventId, error } = await supabase.rpc("send_test_webhook", { p_webhook_id: id });
  if (error || !eventId) return { ok: false, error: "Webhook tidak ditemukan." };
  return sendNow(eventId, null);
}

export async function redeliverWebhookAction(
  deliveryId: string,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await requireHost(PAGE);
  const id = z.uuid().parse(deliveryId);
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeliver_webhook", { p_delivery_id: id });
  if (error) return { ok: false, error: "Pengiriman tidak ditemukan." };
  return sendNow(null, id);
}

// ─── LMS platforms, LTI 1.3 (P8-08) ─────────────────────────────────────────────

const MAX_PLATFORMS = 10;

const httpsUrl = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `Isi ${label}.`)
    .max(500, `${label} terlalu panjang.`)
    .refine((raw) => checkWebhookUrl(raw).ok, `${label} harus https:// ke alamat publik.`);

const platformSchema = z.object({
  name: z.string().trim().min(1, "Beri nama LMS.").max(80, "Nama maksimal 80 huruf."),
  issuer: httpsUrl("Issuer"),
  clientId: z.string().trim().min(1, "Isi Client ID.").max(300, "Client ID terlalu panjang."),
  authLoginUrl: httpsUrl("URL login (OIDC)"),
  authTokenUrl: httpsUrl("URL token"),
  jwksUrl: httpsUrl("URL keyset (JWKS)"),
  deploymentIds: z.string().max(1000),
});

export type PlatformInput = z.input<typeof platformSchema>;

export async function createLtiPlatformAction(input: PlatformInput): Promise<Done> {
  await requireHost(PAGE);
  const parsed = platformSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Tidak valid." };
  const p = parsed.data;
  const deploymentIds = [
    ...new Set(
      p.deploymentIds
        .split(/[\s,]+/)
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ];
  if (deploymentIds.some((id) => id.length > 255) || deploymentIds.length > 20) {
    return { ok: false, error: "Deployment ID tidak valid." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("lti_platforms")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) >= MAX_PLATFORMS) {
    return { ok: false, error: `Maksimal ${MAX_PLATFORMS} LMS. Hapus yang tidak dipakai.` };
  }
  const { error } = await supabase.from("lti_platforms").insert({
    name: p.name,
    // An issuer is compared as a string: keep it exactly as the LMS shows it.
    issuer: p.issuer,
    client_id: p.clientId,
    auth_login_url: p.authLoginUrl,
    auth_token_url: p.authTokenUrl,
    jwks_url: p.jwksUrl,
    deployment_ids: deploymentIds,
  });
  if (error?.code === "23505") {
    return { ok: false, error: "Issuer dan Client ID ini sudah terdaftar." };
  }
  if (error) return { ok: false, error: "LMS gagal disimpan. Coba lagi." };
  revalidatePath(PAGE);
  return { ok: true };
}

export async function deleteLtiPlatformAction(platformId: string): Promise<Done> {
  await requireHost(PAGE);
  const id = z.uuid().parse(platformId);
  const supabase = await createClient();
  const { error } = await supabase.from("lti_platforms").delete().eq("id", id);
  revalidatePath(PAGE);
  return error ? { ok: false, error: "Gagal menghapus." } : { ok: true };
}
