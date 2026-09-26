import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import type { PublicEnv } from "@/lib/env";

import type { Database } from "./database.types";

/**
 * Refresh the Supabase session on every request (from src/proxy.ts) so Server
 * Components always see a valid token, and return who the caller is.
 */
export async function updateSession(request: NextRequest, env: PublicEnv) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {}))
            response.headers.set(key, value);
        },
      },
    },
  );

  // Must run before anything else touches the response: it may refresh the token.
  const { data } = await supabase.auth.getClaims();
  return { response, claims: data?.claims ?? null };
}
