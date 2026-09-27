import { ArrowLeft, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { HostHeader } from "@/components/host/HostHeader";
import { Button } from "@/components/ui/Button";
import { examPhase } from "@/engine/exam/attempt";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

import { ExamWindow, PhaseBadge } from "./parts";

export const metadata: Metadata = { title: "Ujian" };

export default async function ExamsPage({ params }: PageProps<"/quizzes/[id]/exams">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireHost(`/quizzes/${id}/exams`);
  const supabase = await createClient();

  const [{ data: quiz }, { data: version }, { data: exams, error }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("id", id).maybeSingle(),
    supabase.from("quiz_versions").select("id").eq("quiz_id", id).limit(1).maybeSingle(),
    supabase
      .from("sessions")
      .select(
        "id, title, code, status, opens_at, closes_at, created_at, participants(count), attempts(count)",
      )
      .eq("quiz_id", id)
      .eq("mode", "exam")
      .order("created_at", { ascending: false }),
  ]);
  if (!quiz || error) notFound();

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link
              href={`/quizzes/${id}/edit`}
              className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg"
            >
              <ArrowLeft className="size-4" /> Kembali ke editor
            </Link>
            <h1 className="text-2xl font-semibold">Ujian · {quiz.title || "Quiz tanpa judul"}</h1>
          </div>
          {version && (
            <Button asChild>
              <Link href={`/quizzes/${id}/exams/new`}>
                <Plus /> Buat ujian
              </Link>
            </Button>
          )}
        </div>

        {!version ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
            Publish quiz ini dulu di editor. Ujian memakai versi yang sudah terbit, jadi perubahan
            berikutnya tidak mengganggu ujian yang sedang berjalan.
          </p>
        ) : !exams?.length ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
            Belum ada ujian. Buat ujian untuk memberi jadwal, batas waktu, dan pengacakan soal per
            peserta.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {exams.map((exam) => {
              const phase = examPhase(exam);
              return (
                <li key={exam.id}>
                  <Link
                    href={`/quizzes/${id}/exams/${exam.id}`}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate font-semibold">
                          {exam.title || quiz.title || "Ujian"}
                        </span>
                        <PhaseBadge phase={phase} />
                      </span>
                      <span className="text-sm text-fg-subtle">
                        <ExamWindow opensAt={exam.opens_at} closesAt={exam.closes_at} />
                      </span>
                    </div>
                    <dl className="flex gap-5 text-sm">
                      <div>
                        <dt className="text-xs text-fg-subtle">Peserta</dt>
                        <dd className="font-semibold tabular-nums">
                          {exam.participants[0]?.count ?? 0}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-fg-subtle">Percobaan</dt>
                        <dd className="font-semibold tabular-nums">
                          {exam.attempts[0]?.count ?? 0}
                        </dd>
                      </div>
                      {exam.code && phase !== "closed" && (
                        <div>
                          <dt className="text-xs text-fg-subtle">Kode</dt>
                          <dd className="font-mono font-semibold tracking-wider">{exam.code}</dd>
                        </div>
                      )}
                    </dl>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
