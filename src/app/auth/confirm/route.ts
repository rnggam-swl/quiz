import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/auth";
import { createRecoveryMarker, RECOVERY_COOKIE, recoveryCookieOptions } from "@/lib/recovery";
import { createClient } from "@/lib/supabase/server";

const TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

/**
 * Email links with a `token_hash` (Supabase's server-side flow). Unlike the PKCE `code` in
 * /auth/callback, these work when the email is opened on another device, e.g. the reset
 * link read on a phone. Used once the email templates point here (docs/02 · Identitas).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const recovery = type === "recovery";
  const next = safeNextPath(searchParams.get("next"), recovery ? "/reset-password" : "/quizzes");

  if (tokenHash && type && TYPES.has(type)) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      const response = NextResponse.redirect(new URL(next, origin));
      if (recovery && data.user) {
        response.cookies.set(
          RECOVERY_COOKIE,
          createRecoveryMarker(data.user.id),
          recoveryCookieOptions,
        );
      }
      return response;
    }
  }
  return NextResponse.redirect(
    new URL(recovery ? "/forgot-password?error=link" : "/login?error=link", origin),
  );
}
