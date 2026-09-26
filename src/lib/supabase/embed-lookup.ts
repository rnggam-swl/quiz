import { createClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

// Used by src/proxy.ts, which can't import `server-only` modules, so this file
// reads the secret key itself. It only ever returns a quiz's public embed list.

const CACHE_MS = 60_000;
const cache = new Map<string, { origins: string[]; at: number }>();

/** Allowed embed origins for a quiz slug (cached for a minute). Empty on any problem. */
export async function embedOriginsForSlug(slug: string): Promise<string[]> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return [];
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.origins;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return [];
  try {
    const { data } = await createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
      .from("quizzes")
      .select("embed_allowed_origins")
      .eq("slug", slug)
      .maybeSingle();
    const origins = data?.embed_allowed_origins ?? [];
    if (cache.size > 500) cache.clear();
    cache.set(slug, { origins, at: Date.now() });
    return origins;
  } catch {
    return [];
  }
}
