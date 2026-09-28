import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { HostClient } from "./HostClient";

export const metadata: Metadata = { title: "Live" };

/** The projector screen of a live session (docs/09-mode-live.md). Host only. */
export default async function HostPage({ params }: PageProps<"/host/[sessionId]">) {
  const { sessionId } = await params;
  if (!z.uuid().safeParse(sessionId).success) notFound();
  await requireHost(`/host/${sessionId}`);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select("id, quiz_id")
    .eq("id", sessionId)
    .eq("mode", "live")
    .maybeSingle();
  if (!session) notFound();

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost"}`;
  return (
    <HostClient
      sessionId={session.id}
      joinUrl={`${origin}/join`}
      reportHref={`/quizzes/${session.quiz_id}/live/${session.id}`}
    />
  );
}
