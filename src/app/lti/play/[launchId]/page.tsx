import type { Metadata } from "next";

import { isSessionOpen, loadSessionById, playInfo } from "@/engine/practice/server";
import { createAdminClient } from "@/lib/supabase/admin";

import { EmbedClient } from "../../../embed/[slug]/EmbedClient";
import { loadLaunch, ltiEmbedToken } from "../../launch";
import { Notice } from "../../Notice";

export const metadata: Metadata = { title: "Quiz", robots: { index: false } };

/**
 * A learner's quiz inside the LMS (P8-08, docs/07-embed.md#lti-13). The quiz's standing
 * practice session, with the LMS identity; the score goes to the gradebook on submit.
 */
export default async function LtiPlayPage({ params }: PageProps<"/lti/play/[launchId]">) {
  const { launchId } = await params;
  const launch = await loadLaunch(launchId, "LtiResourceLinkRequest");
  if (!launch?.quiz_id) {
    return <Notice>Tautan ini sudah kedaluwarsa. Buka lagi aktivitasnya dari LMS.</Notice>;
  }

  const { data: session } = await createAdminClient().rpc("lti_practice_session", {
    p_quiz_id: launch.quiz_id,
  });
  const ctx = session ? await loadSessionById(session.id) : null;
  if (!ctx?.quiz.slug) return <Notice>Quiz ini belum diterbitkan.</Notice>;
  if (!isSessionOpen(ctx)) return <Notice>Quiz ini sedang ditutup oleh pengajar.</Notice>;

  const learner = { externalId: launch.external_id, name: launch.name };
  const token = await ltiEmbedToken({ id: ctx.quiz.id, slug: ctx.quiz.slug }, learner);
  if (!token) return <Notice>Quiz belum bisa dibuka. Coba lagi sebentar.</Notice>;

  return (
    <EmbedClient
      slug={ctx.quiz.slug}
      sessionId={ctx.session.id}
      info={playInfo(ctx)}
      // The LMS doesn't speak our postMessage protocol: nothing to tell the parent.
      allowedOrigins={[]}
      embedToken={token}
      identity={learner}
      theme={null}
    />
  );
}
