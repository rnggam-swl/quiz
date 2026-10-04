import "server-only";

import { z } from "zod";

import { generateEmbedSecret, signEmbedToken } from "@/lib/embed-token";
import type { Platform } from "@/lib/lti/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Launches saved by /api/lti/launch (P8-08). The id in the URL is the learner's pass into
// the quiz, so it only works for an hour: after that, they open the activity in the LMS again.

const LAUNCH_TTL_MS = 60 * 60_000;

export async function loadLaunch(
  launchId: string,
  type: "LtiResourceLinkRequest" | "LtiDeepLinkingRequest",
  now = Date.now(),
) {
  if (!z.uuid().safeParse(launchId).success) return null;
  const { data } = await createAdminClient()
    .from("lti_launches")
    .select("*, lti_platforms!inner(*)")
    .eq("id", launchId)
    .eq("message_type", type)
    .maybeSingle();
  if (!data || now - Date.parse(data.created_at) > LAUNCH_TTL_MS) return null;
  const { lti_platforms, ...launch } = data;
  return { ...launch, platform: lti_platforms as Platform };
}

/** The quiz's embed secret, made if the owner never opened the embed settings. */
async function embedSecret(quizId: string): Promise<string | null> {
  const admin = createAdminClient();
  const read = () =>
    admin.from("quiz_embed_secrets").select("secret").eq("quiz_id", quizId).maybeSingle();
  const { data } = await read();
  if (data) return data.secret;
  await admin
    .from("quiz_embed_secrets")
    .upsert(
      { quiz_id: quizId, secret: generateEmbedSecret() },
      { onConflict: "quiz_id", ignoreDuplicates: true },
    );
  return (await read()).data?.secret ?? null;
}

/**
 * An embed token for the learner, as if the LMS had signed one: the practice player then
 * joins with the LMS identity through the usual embed path.
 */
export async function ltiEmbedToken(
  quiz: { id: string; slug: string },
  learner: { externalId: string; name: string | null },
  now = Date.now(),
): Promise<string | null> {
  const secret = await embedSecret(quiz.id);
  if (!secret) return null;
  return signEmbedToken(secret, {
    sub: learner.externalId,
    ...(learner.name && { name: learner.name }),
    quiz: quiz.slug,
    exp: Math.floor(now / 1000) + 3600,
  });
}
