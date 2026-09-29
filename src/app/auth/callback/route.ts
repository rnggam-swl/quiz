import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth";
import { createRecoveryMarker, RECOVERY_COOKIE, recoveryCookieOptions } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";

/** Landing point for OAuth, email-confirmation and password-reset links (PKCE `code` → session cookie). */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next"));

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const response = NextResponse.redirect(new URL(next, origin));
      // Reset link (P8-16): this session may set a new password without the old one.
      if (searchParams.get("flow") === "recovery" && data.user) {
        response.cookies.set(
          RECOVERY_COOKIE,
          createRecoveryMarker(data.user.id),
          recoveryCookieOptions,
        );
      }
      return response;
    }
  }
  const failed =
    searchParams.get("flow") === "recovery" ? "/forgot-password?error=link" : "/login?error=link";
  return NextResponse.redirect(new URL(failed, origin));
}
