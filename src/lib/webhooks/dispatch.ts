import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { after } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

import { webhookHeaders } from "./signing";
import { allowLocalWebhooks as allowLocal, checkWebhookUrl, isPrivateAddress } from "./url";

// Sends queued webhook deliveries (P8-06, docs/07-embed.md#webhook). Rows come from the
// outbox (webhook_deliveries); claim_webhook_deliveries locks them, so several dispatchers
// (a Server Action's after(), the cron ping) never send the same try twice.

const TIMEOUT_MS = 10_000;

type Claimed = {
  id: string;
  event_id: string;
  payload: unknown;
  url: string;
  secret: string;
};

type Outcome = { ok: boolean; status?: number; body?: string; error?: string };

/** Every address the hostname resolves to must be public (the URL was checked when saved). */
async function resolvesPublic(url: URL): Promise<boolean> {
  if (allowLocal) return true;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return !isPrivateAddress(host);
  const addresses = await lookup(host, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every((a) => !isPrivateAddress(a.address));
}

async function send(delivery: Claimed): Promise<Outcome> {
  const check = checkWebhookUrl(delivery.url, { allowLocal });
  if (!check.ok) return { ok: false, error: check.error };
  try {
    if (!(await resolvesPublic(check.url))) {
      return { ok: false, error: "Alamat tujuan lokal atau privat." };
    }
  } catch {
    return { ok: false, error: "Nama domain tidak ditemukan." };
  }

  const body = JSON.stringify(delivery.payload);
  try {
    const response = await fetch(check.url, {
      method: "POST",
      headers: webhookHeaders(delivery.secret, delivery.event_id, body),
      body,
      // A redirect could point anywhere, including our own network: treat it as a failure.
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await response.text().catch(() => "");
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      body: text.slice(0, 500),
    };
  } catch (error) {
    const timeout = error instanceof Error && error.name === "TimeoutError";
    return { ok: false, error: timeout ? "Tidak ada jawaban dalam 10 detik." : "Gagal terhubung." };
  }
}

/** Send what's due (up to `limit`). Never throws. */
export async function dispatchWebhooks(limit = 20): Promise<{ sent: number; failed: number }> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_webhook_deliveries", { p_limit: limit });
    if (error || !data?.length) return { sent: 0, failed: 0 };
    const results = await Promise.all(
      data.map(async (delivery) => {
        const outcome = await send(delivery);
        await admin.rpc("finish_webhook_delivery", {
          p_delivery_id: delivery.id,
          p_ok: outcome.ok,
          p_status: outcome.status,
          p_body: outcome.body,
          p_error: outcome.error,
        });
        return outcome.ok;
      }),
    );
    const sent = results.filter(Boolean).length;
    return { sent, failed: results.length - sent };
  } catch {
    return { sent: 0, failed: 0 };
  }
}

/** After the response: send deliveries an action just queued (attempt submitted, test). */
export function dispatchWebhooksAfterResponse(): void {
  after(() => dispatchWebhooks());
}
