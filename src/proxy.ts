import { NextResponse, type NextRequest } from "next/server";

import { getPublicEnv, type PublicEnv } from "@/lib/env";
import { updateSession } from "@/lib/supabase/proxy";

/** Routes for signed-in hosts. The real check is in the DAL (src/lib/auth.ts); this is the fast path. */
const HOST_ROUTES = ["/quizzes"];

export async function proxy(request: NextRequest) {
  let env: PublicEnv;
  try {
    env = getPublicEnv();
  } catch {
    // No Supabase configured (e.g. fresh checkout): let public pages work;
    // protected pages fail loudly in the DAL instead.
    return NextResponse.next({ request });
  }

  const { response, claims } = await updateSession(request, env);
  const { pathname, search } = request.nextUrl;
  const isHost = claims !== null && claims.is_anonymous !== true;

  if (!isHost && HOST_ROUTES.some((r) => pathname === r || pathname.startsWith(`${r}/`))) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${pathname}${search}`);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  // Everything except static files and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
