import { Download, Flag } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/Button";
import { scoreBand } from "@/engine/practice/gamification";
import { FLAG_BELOW_PERCENT } from "@/engine/exam/report";
import { cn } from "@/lib/cn";

import { ATTEMPT_STATUS, Badge, Stat } from "../../parts";
import { buildReport } from "./build";
import { ItemAnalysis } from "./ItemAnalysis";

export const metadata: Metadata = { title: "Laporan ujian" };

export default async function ReportPage({
  params,
}: PageProps<"/quizzes/[id]/exams/[examId]/report">) {
  const { id, examId } = await params;
  const { rows, items, stats } = await buildReport(id, examId);
  const csv = `/quizzes/${id}/exams/${examId}/report/csv`;

  return (
    <div className="flex flex-col gap-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Peserta" value={stats.participants} />
        <Stat label="Selesai" value={stats.finished} />
        <Stat label="Rata-rata nilai" value={stats.average === null ? "–" : `${stats.average}%`} />
        <Stat label="Esai belum dinilai" value={stats.pending} />
      </dl>

      <section className="flex flex-col gap-3" aria-labelledby="scores-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="scores-title" className="text-lg font-semibold">
            Nilai peserta
          </h2>
          <Button asChild variant="secondary" size="sm">
            <a href={`${csv}?kind=scores`} download>
              <Download /> Unduh CSV
            </a>
          </Button>
        </div>
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-fg-muted">
            Belum ada yang mengerjakan.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="border-b border-line text-xs text-fg-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Peserta
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Nilai
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Durasi
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">
                    Integritas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => {
                  const band = r.percent === null ? null : scoreBand(r.percent);
                  const status = ATTEMPT_STATUS[r.status];
                  return (
                    <tr key={r.participantId}>
                      <td className="px-4 py-3">
                        <span className="font-medium">{r.name}</span>
                        {r.identifier && (
                          <span className="ml-2 text-xs text-fg-subtle">{r.identifier}</span>
                        )}
                        {r.attempts > 1 && (
                          <span className="ml-2 text-xs text-fg-subtle">
                            {r.attempts} percobaan
                          </span>
                        )}
                      </td>
                      <td
                        className={cn(
                          "px-4 py-3 font-semibold tabular-nums",
                          band === "great" && "text-success",
                          band === "ok" && "text-warning",
                          band === "low" && "text-danger",
                        )}
                      >
                        {r.percent === null ? "–" : `${r.percent}%`}
                        {r.pending > 0 && (
                          <span className="ml-2 text-xs font-normal text-warning">
                            {r.pending} esai belum dinilai
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-fg-muted tabular-nums">{r.duration ?? "–"}</td>
                      <td className="px-4 py-3 text-xs text-fg-muted">{r.integrity || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="items-title">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 id="items-title" className="text-lg font-semibold">
              Analisis butir soal
            </h2>
            <p className="text-sm text-fg-muted">
              Dari percobaan yang sudah selesai. <Flag className="inline size-3.5 text-danger" /> =
              benar di bawah {FLAG_BELOW_PERCENT}%: cek lagi kunci jawabannya.
            </p>
          </div>
          <Button asChild variant="secondary" size="sm">
            <a href={`${csv}?kind=items`} download>
              <Download /> Unduh CSV
            </a>
          </Button>
        </div>
        {items.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-fg-muted">
            Analisis muncul setelah ada percobaan yang selesai.
          </p>
        ) : (
          <ItemAnalysis items={items} />
        )}
      </section>
    </div>
  );
}
