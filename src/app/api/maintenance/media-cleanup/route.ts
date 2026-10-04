import { NextResponse, type NextRequest } from "next/server";

import { rejectUnlessCron } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

// P8-15 · Delete orphaned files from the quiz-media bucket (docs/03-data-model.md#konten).
// Daily from pg_cron (call_app) or Vercel Cron. `?dry=1` only lists what would go.

export const maxDuration = 60;

const MAX_PER_RUN = 5000;
const CHUNK = 100;

async function handle(request: NextRequest) {
  const rejected = rejectUnlessCron(request);
  if (rejected) return rejected;
  const dry = request.nextUrl.searchParams.get("dry") === "1";

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("orphan_media", { p_limit: MAX_PER_RUN });
  if (error) return NextResponse.json({ error: "orphan_media gagal." }, { status: 500 });
  const names = (data ?? []).map((row) => row.name);
  if (dry) return NextResponse.json({ dry: true, count: names.length, names });

  let deleted = 0;
  for (let i = 0; i < names.length; i += CHUNK) {
    const { data: removed, error: removeError } = await admin.storage
      .from("quiz-media")
      .remove(names.slice(i, i + CHUNK));
    if (removeError) break;
    deleted += removed?.length ?? 0;
  }
  return NextResponse.json(
    { deleted, found: names.length },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = handle;
export const POST = handle;
