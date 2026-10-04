import { NextResponse, type NextRequest } from "next/server";

import { frameAncestors } from "@/lib/embed-origins";
import { getPublicEnv, type PublicEnv } from "@/lib/env";
import { embedOriginsForSlug } from "@/lib/supabase/embed-lookup";
import { updateSession } from "@/lib/supabase/proxy";

/** Routes for signed-in hosts. The real check is in the DAL (src/lib/auth.ts); this is the fast path. */
const HOST_ROUTES = ["/quizzes", "/host", "/account"];

/** Headers every page gets. Embed pages override frame-ancestors per quiz. */
function secure(response: NextResponse, csp = "frame-ancestors 'self'"): NextResponse {
  response.headers.set("Content-Security-Policy", csp);
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Embeds live in other sites' iframes: no auth cookies, only the quiz's allowed ancestors.
  if (pathname.startsWith("/embed/")) {
    const slug = pathname.split("/")[2] ?? "";
    return secure(NextResponse.next({ request }), frameAncestors(await embedOriginsForSlug(slug)));
  }

  // LTI (P8-08): framed by whichever LMS the teacher registered; the launch itself was
  // verified by /api/lti/launch, so no session cookies here either.
  if (pathname.startsWith("/lti/")) {
    return secure(NextResponse.next({ request }), "frame-ancestors *");
  }

  let env: PublicEnv;
  try {
    env = getPublicEnv();
  } catch {
    // No Supabase configured (e.g. fresh checkout): let public pages work;
    // protected pages fail loudly in the DAL instead.
    return secure(NextResponse.next({ request }));
  }

  const { response, claims } = await updateSession(request, env);
  const isHost = claims !== null && claims.is_anonymous !== true;

  if (!isHost && HOST_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return secure(NextResponse.redirect(login));
  }

  return secure(response);
}

export const config = {
  // Everything except static files, images, and the public APIs that need no session: the
  // clock-sync ping, oEmbed, the token-authenticated REST API, the scheduled jobs and the LTI
  // endpoints the LMS calls.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|embed\\.js|api/time|api/oembed|api/v1|api/webhooks|api/maintenance|api/lti|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
