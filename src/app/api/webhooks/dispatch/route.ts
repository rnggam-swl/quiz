import { NextResponse, type NextRequest } from "next/server";

import { rejectUnlessCron } from "@/lib/cron";
import { dispatchWebhooks } from "@/lib/webhooks/dispatch";

// Retries for webhook deliveries (P8-06). Called each minute by pg_cron via pg_net when the
// app URL and CRON_SECRET are in Supabase Vault, or by Vercel Cron (GET, same header).

export const maxDuration = 60;

async function handle(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;

  // A few batches, well inside the time limit (each send times out after 10 s).
  const total = { sent: 0, failed: 0 };
  for (let batch = 0; batch < 3; batch++) {
    const { sent, failed } = await dispatchWebhooks(20);
    total.sent += sent;
    total.failed += failed;
    if (sent + failed < 20) break;
  }
  return NextResponse.json(total, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
