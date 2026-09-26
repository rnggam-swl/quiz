import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";

import { createClient } from "./supabase/server";

export type SessionUser = { id: string; email: string | null; isAnonymous: boolean };

/**
 * Data Access Layer: who is calling, verified from the JWT (getClaims verifies
 * the signature). Memoized per request.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return null;
  const { claims } = data;
  return { id: claims.sub, email: claims.email ?? null, isAnonymous: claims.is_anonymous === true };
});

/** A signed-in host (not an anonymous participant), or redirect to login. */
export async function requireHost(returnTo?: string): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user || user.isAnonymous) {
    redirect(returnTo ? `/login?next=${encodeURIComponent(returnTo)}` : "/login");
  }
  return user;
}

/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNextPath(next: string | null | undefined, fallback = "/quizzes"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\"))
    return fallback;
  return next;
}
