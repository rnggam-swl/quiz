import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { HostHeader } from "@/components/host/HostHeader";
import { scoreBand } from "@/engine/practice/gamification";
import { requireHost } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { formatDuration, timeAgo } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Hasil" };

const STATUS = {
  submitted: { label: "Selesai", tone: "bg-success-soft text-success" },
  in_progress: { label: "Mengerjakan", tone: "bg-accent-soft text-accent-fg" },
  expired: { label: "Waktu habis", tone: "bg-warning-soft text-warning" },
} as const;

export default async function ResultsPage({ params }: PageProps<"/quizzes/[id]/results">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireHost(`/quizzes/${id}/results`);
  const supabase = await createClient();

  const [{ data: quiz }, { data: attempts, error }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("attempts")
      .select(
        "id, attempt_no, status, score, max_score, started_at, submitted_at, participants!inner(nickname, external_id), sessions!inner(quiz_id)",
      )
      .eq("sessions.quiz_id", id)
      .order("started_at", { ascending: false })
      .limit(500),
  ]);
  if (!quiz || error) notFound();

  const rows = attempts ?? [];
  const finished = rows.filter((a) => a.status === "submitted" && a.max_score);
  const average = finished.length
    ? Math.round(
        (finished.reduce((sum, a) => sum + Number(a.score) / Number(a.max_score), 0) /
          finished.length) *
          100,
      )
    : null;
  const people = new Set(rows.map((a) => a.participants.nickname)).size;

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-1">
          <Link
            href={`/quizzes/${id}/edit`}
            className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Kembali ke editor
          </Link>
          <h1 className="text-2xl font-semibold">Hasil · {quiz.title || "Quiz tanpa judul"}</h1>
        </div>

        <dl className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Peserta", value: people },
            { label: "Percobaan selesai", value: finished.length },
            { label: "Rata-rata nilai", value: average === null ? "–" : `${average}%` },
          ].map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-line bg-surface p-4 shadow-card"
            >
              <dt className="text-sm text-fg-subtle">{stat.label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
            Belum ada yang mengerjakan. Bagikan quiz lewat tombol <strong>Bagikan</strong> di
            editor.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs text-fg-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Peserta
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Percobaan
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nilai
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Durasi
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Mulai
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((a) => {
                  const percent =
                    a.status === "submitted" && a.max_score
                      ? Math.round((Number(a.score) / Number(a.max_score)) * 100)
                      : null;
                  const band = percent === null ? null : scoreBand(percent);
                  const status = STATUS[a.status];
                  return (
                    <tr key={a.id} className="hover:bg-surface-muted">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/quizzes/${id}/results/${a.id}`} className="hover:underline">
                          {a.participants.nickname}
                        </Link>
                        {a.participants.external_id && (
                          <span className="ml-2 text-xs text-fg-subtle">
                            ({a.participants.external_id})
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums">#{a.attempt_no}</td>
                      <td
                        className={cn(
                          "px-4 py-3 font-semibold tabular-nums",
                          band === "great" && "text-success",
                          band === "ok" && "text-warning",
                          band === "low" && "text-danger",
                        )}
                      >
                        {percent === null ? "–" : `${percent}%`}
                      </td>
                      <td className="px-4 py-3 text-fg-muted tabular-nums">
                        {a.submitted_at ? formatDuration(a.started_at, a.submitted_at) : "–"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-medium",
                            status.tone,
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-fg-subtle">{timeAgo(a.started_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </>
  );
}
