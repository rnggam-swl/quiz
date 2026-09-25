import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getServerEnv } from "@/lib/env.server";

import type { Database } from "./database.types";

/**
 * Secret-key client that BYPASSES RLS. Only for trusted server code — scoring
 * and the `record_*` RPCs that are granted to service_role alone
 * (docs/02-architecture.md#alur-penilaian-server-authoritative).
 * Never pass user-controlled filters straight into it.
 */
export function createAdminClient() {
  const env = getServerEnv();
  return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
