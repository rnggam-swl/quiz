import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { HostHeader } from "@/components/host/HostHeader";
import { parseSnapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getDefinition } from "@/questions/registry";

import { ExamWizard, type CompatNote } from "./ExamWizard";

export const metadata: Metadata = { title: "Buat ujian" };

export default async function NewExamPage({ params }: PageProps<"/quizzes/[id]/exams/new">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireHost(`/quizzes/${id}/exams/new`);
  const supabase = await createClient();

  const [{ data: quiz }, { data: version }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("quiz_versions")
      .select("version, snapshot")
      .eq("quiz_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!quiz) notFound();
  const snapshot = parseSnapshot(version?.snapshot);
  if (!version || !snapshot) redirect(`/quizzes/${id}/exams`);

  // Tags for the question bank filter, with how many questions carry each one.
  const tags = new Map<string, number>();
  for (const q of snapshot.questions) {
    for (const tag of new Set(q.tags.map((t) => t.trim()).filter(Boolean))) {
      tags.set(tag, (tags.get(tag) ?? 0) + 1);
    }
  }

  // Question types that don't fully support exams (docs/04 · capability matrix).
  const compat: CompatNote[] = snapshot.questions.flatMap((q, i) => {
    const def = getDefinition(q.type);
    const level = def.capabilities.modes.exam;
    if (level === "ok") return [];
    return [
      {
        number: i + 1,
        typeLabel: def.label,
        level: level ?? "unsupported",
        note: def.capabilities.notes?.exam ?? "",
      },
    ];
  });

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link
            href={`/quizzes/${id}/exams`}
            className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Daftar ujian
          </Link>
          <h1 className="text-2xl font-semibold">Buat ujian</h1>
          <p className="text-sm text-fg-muted">
            Memakai versi {version.version} dari “{quiz.title || "Quiz tanpa judul"}” (
            {snapshot.questions.length} soal). Perubahan quiz setelah ini tidak mengubah ujian.
          </p>
        </div>
        <ExamWizard
          quizId={id}
          defaultTitle={quiz.title}
          questionCount={snapshot.questions.length}
          tags={[...tags].map(([tag, count]) => ({ tag, count }))}
          questionTags={snapshot.questions.map((q) => q.tags)}
          compat={compat}
        />
      </main>
    </>
  );
}
