import { externalIdFor, parseLaunch } from "@/lib/lti/claims";
import { consumeLoginState, verifyIdToken } from "@/lib/lti/server";
import { hostOrigin } from "@/lib/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";

import { ltiErrorPage } from "../respond";

// Step 2 of an LTI 1.3 launch (P8-08): the LMS posts the signed id_token here. Once it checks
// out, the launch is saved and the browser goes on to play (/lti/play) or, for a teacher
// adding the activity, to pick a quiz (/lti/deep-link).

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null);
  const idToken = form?.get("id_token");
  const state = form?.get("state");
  if (typeof idToken !== "string" || typeof state !== "string") {
    return ltiErrorPage("Peluncuran LTI tidak lengkap. Buka lagi dari LMS.");
  }

  const login = await consumeLoginState(state);
  if (!login) return ltiErrorPage("Sesi peluncuran sudah kedaluwarsa. Buka lagi dari LMS.");
  const { platform } = login;
  const claims = await verifyIdToken(idToken, platform, login.nonce);
  if (!claims) return ltiErrorPage("Tanda tangan dari LMS tidak valid.", 401);
  const parsed = parseLaunch(claims);
  if (!parsed.ok) return ltiErrorPage(parsed.error);
  const launch = parsed.launch;
  if (platform.deployment_ids.length && !platform.deployment_ids.includes(launch.deploymentId)) {
    return ltiErrorPage("Deployment LTI ini belum didaftarkan untuk LMS tersebut.", 403);
  }

  const admin = createAdminClient();
  let quizId: string | null = null;
  if (launch.messageType === "LtiDeepLinkingRequest") {
    if (!launch.instructor || !launch.deepLinkReturnUrl) {
      return ltiErrorPage("Hanya pengajar yang bisa memilih quiz untuk aktivitas ini.", 403);
    }
  } else {
    if (!launch.quizSlug) {
      return ltiErrorPage(
        "Aktivitas ini belum terhubung ke quiz. Pengajar bisa memilihnya saat menambah aktivitas (Deep Linking).",
      );
    }
    // Only the quizzes of the teacher who registered this LMS, and only published ones.
    const { data: quiz } = await admin
      .from("quizzes")
      .select("id")
      .eq("slug", launch.quizSlug)
      .eq("owner_id", platform.owner_id)
      .not("latest_version", "is", null)
      .maybeSingle();
    if (!quiz) return ltiErrorPage("Quiz untuk aktivitas ini tidak ditemukan.", 404);
    quizId = quiz.id;
  }

  const { data: row, error } = await admin
    .from("lti_launches")
    .insert({
      platform_id: platform.id,
      deployment_id: launch.deploymentId,
      message_type: launch.messageType,
      lti_user_id: launch.userId,
      external_id: externalIdFor(platform.id, launch.userId),
      name: launch.name,
      resource_link_id: launch.resourceLinkId,
      quiz_id: quizId,
      lineitem: launch.lineitem,
      deep_link_return_url: launch.deepLinkReturnUrl,
      deep_link_data: launch.deepLinkData,
    })
    .select("id")
    .single();
  if (error || !row) return ltiErrorPage("Peluncuran gagal disimpan. Coba lagi.", 500);

  const page = launch.messageType === "LtiDeepLinkingRequest" ? "deep-link" : "play";
  return new Response(null, {
    status: 303,
    headers: { Location: `${await hostOrigin()}/lti/${page}/${row.id}` },
  });
}
