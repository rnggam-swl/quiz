"use server";

import { z } from "zod";

import { deepLinkClaims } from "@/lib/lti/claims";
import { signDeepLinkResponse } from "@/lib/lti/server";
import { hostOrigin } from "@/lib/request-origin";
import { createAdminClient } from "@/lib/supabase/admin";

import { loadLaunch } from "../../launch";

export type DeepLinkResult =
  { ok: true; returnUrl: string; jwt: string } | { ok: false; error: string };

/**
 * The signed deep-linking response for the chosen quiz (P8-08). Public like the page: the
 * launch id is the pass, it's used once, and only its account's published quizzes qualify.
 */
export async function chooseQuizAction(launchId: string, quizId: string): Promise<DeepLinkResult> {
  if (!z.uuid().safeParse(quizId).success) return { ok: false, error: "Quiz tidak valid." };
  const launch = await loadLaunch(launchId, "LtiDeepLinkingRequest");
  if (!launch?.deep_link_return_url) {
    return { ok: false, error: "Tautan sudah kedaluwarsa. Tambahkan aktivitasnya lagi dari LMS." };
  }
  const admin = createAdminClient();
  const { data: quiz } = await admin
    .from("quizzes")
    .select("slug, title")
    .eq("id", quizId)
    .eq("owner_id", launch.platform.owner_id)
    .not("latest_version", "is", null)
    .maybeSingle();
  if (!quiz?.slug) return { ok: false, error: "Quiz tidak ditemukan." };

  const jwt = await signDeepLinkResponse(
    deepLinkClaims({
      clientId: launch.platform.client_id,
      issuer: launch.platform.issuer,
      deploymentId: launch.deployment_id,
      data: launch.deep_link_data,
      launchUrl: `${await hostOrigin()}/api/lti/launch`,
      quiz: { slug: quiz.slug, title: quiz.title },
    }),
  );
  await admin.from("lti_launches").delete().eq("id", launch.id);
  return { ok: true, returnUrl: launch.deep_link_return_url, jwt };
}
