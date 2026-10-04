import { authRedirect } from "@/lib/lti/claims";
import { createLoginState, findPlatform } from "@/lib/lti/server";
import { hostOrigin } from "@/lib/request-origin";

import { ltiErrorPage, ltiParams } from "../respond";

// Step 1 of an LTI 1.3 launch (P8-08): third-party initiated login. The LMS tells us who's
// coming; we remember a one-use state and nonce and send the browser back to the LMS to
// authenticate. The answer comes to /api/lti/launch.

async function login(request: Request) {
  const params = await ltiParams(request);
  const issuer = params.get("iss");
  const loginHint = params.get("login_hint");
  if (!issuer || !loginHint) return ltiErrorPage("Permintaan login LTI tidak lengkap.");

  const platform = await findPlatform(issuer, params.get("client_id"));
  if (!platform) {
    return ltiErrorPage(
      "LMS ini belum didaftarkan. Guru perlu menambahkannya di Akun → Integrasi → LMS (LTI 1.3).",
      404,
    );
  }
  const deployment = params.get("lti_deployment_id");
  if (
    deployment &&
    platform.deployment_ids.length &&
    !platform.deployment_ids.includes(deployment)
  ) {
    return ltiErrorPage("Deployment LTI ini belum didaftarkan untuk LMS tersebut.", 403);
  }

  const { state, nonce } = await createLoginState(platform.id);
  const location = authRedirect(platform, {
    redirectUri: `${await hostOrigin()}/api/lti/launch`,
    loginHint,
    messageHint: params.get("lti_message_hint"),
    state,
    nonce,
  });
  return new Response(null, { status: 302, headers: { Location: location } });
}

export const GET = login;
export const POST = login;
