import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { HostHeader } from "@/components/host/HostHeader";
import { resolvePolicy } from "@/engine/policy";
import { questionsInOrder, storedResult, toPlayQuestion } from "@/engine/practice/attempt";
import { parseSnapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import { formatDuration } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

import { AttemptReview, type ReviewEntry } from "./AttemptReview";

export const metadata: Metadata = { title: "Detail jawaban" };

export default async function AttemptPage({
  params,
}: PageProps<"/quizzes/[id]/results/[attemptId]">) {
  const { id, attemptId } = await params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(attemptId).success) notFound();
  const user = await requireHost(`/quizzes/${id}/results/${attemptId}`);
  const supabase = await createClient();

  // RLS: only the quiz owner can read these rows.
  const { data: attempt } = await supabase
    .from("attempts")
    .select(
      "id, attempt_no, status, seed, question_ids, score, max_score, xp, started_at, submitted_at, quiz_version_id, participants!inner(nickname), sessions!inner(quiz_id, mode, policy)",
    )
    .eq("id", attemptId)
    .eq("sessions.quiz_id", id)
    .maybeSingle();
  if (!attempt) notFound();

  const [{ data: version }, { data: responses }] = await Promise.all([
    supabase
      .from("quiz_versions")
      .select("snapshot, version")
      .eq("id", attempt.quiz_version_id)
      .maybeSingle(),
    supabase
      .from("responses")
      .select("question_id, answer, correct, total, points")
      .eq("attempt_id", attemptId),
  ]);
  const snapshot = version ? parseSnapshot(version.snapshot) : null;
  if (!snapshot) notFound();

  const policy = resolvePolicy(attempt.sessions.mode, attempt.sessions.policy);
  const byQuestion = new Map((responses ?? []).map((r) => [r.question_id, r]));
  const entries: ReviewEntry[] = questionsInOrder(snapshot, attempt.question_ids).map((q) => {
    const response = byQuestion.get(q.id);
    return {
      id: q.id,
      type: q.type,
      prompt: q.prompt,
      data: toPlayQuestion(q, Number(attempt.seed), policy).data,
      config: q.config,
      explanation: q.explanation,
      answer: response?.answer ?? null,
      result: response ? storedResult(response.correct, response.total) : null,
      points: response?.points ?? 0,
      maxPoints: q.points,
    };
  });

  const percent =
    attempt.status === "submitted" && attempt.max_score
      ? Math.round((Number(attempt.score) / Number(attempt.max_score)) * 100)
      : null;

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link
            href={`/quizzes/${id}/results`}
            className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Semua hasil
          </Link>
          <h1 className="text-2xl font-semibold">
            {attempt.participants.nickname}{" "}
            <span className="text-base font-normal text-fg-subtle">
              · percobaan #{attempt.attempt_no}
            </span>
          </h1>
          <p className="text-sm text-fg-muted">
            {percent === null
              ? "Belum selesai"
              : `Nilai ${percent}% (${attempt.score} dari ${attempt.max_score} poin)`}
            {attempt.submitted_at &&
              ` · ${formatDuration(attempt.started_at, attempt.submitted_at)}`}
            {attempt.xp ? ` · ${attempt.xp} XP` : ""}
            {` · versi quiz ${version?.version}`}
          </p>
        </div>
        <AttemptReview entries={entries} />
      </main>
    </>
  );
}
