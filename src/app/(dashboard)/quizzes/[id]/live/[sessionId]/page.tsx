import { ArrowLeft, Download, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HostHeader } from "@/components/host/HostHeader";
import { Button } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";

import { ItemAnalysis } from "../../exams/[examId]/report/ItemAnalysis";
import { Stat } from "../../exams/parts";
import { buildLiveReport } from "./build";
import { LeaderboardReplay } from "./LeaderboardReplay";

export const metadata: Metadata = { title: "Laporan live" };

const seconds = (ms: number | null) => (ms === null ? "–" : `${(ms / 1000).toFixed(1)} dtk`);

export default async function LiveReportPage({
  params,
}: PageProps<"/quizzes/[id]/live/[sessionId]">) {
  const { id, sessionId } = await params;
  const { user, session, title, battle, standings, replay, items, questionCount } =
    await buildLiveReport(id, sessionId);
  const headers = battle
    ? ["#", "Peserta", "Skor", "Menang", "Benar", "Ketepatan", "Rata-rata waktu"]
    : ["#", "Peserta", "Skor", "Benar", "Ketepatan", "Rata-rata waktu"];
  const csv = `/quizzes/${id}/live/${sessionId}/csv`;
  const average = standings.length
    ? Math.round(standings.reduce((s, r) => s + r.accuracy, 0) / standings.length)
    : null;

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <Link
              href={`/quizzes/${id}/live`}
              className="inline-flex items-center gap-1 text-sm text-fg-subtle hover:text-fg"
            >
              <ArrowLeft className="size-4" /> Sesi live
            </Link>
            <h1 className="text-2xl font-semibold">
              {battle ? "Laporan rebutan" : "Laporan live"} · {title}
            </h1>
            <p className="text-sm text-fg-muted">
              <LocalTime iso={session.created_at} />
            </p>
          </div>
          {session.phase !== "ended" && (
            <Button asChild variant="secondary">
              <Link href={`/host/${sessionId}`}>
                <MonitorPlay /> Buka layar host
              </Link>
            </Button>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Peserta" value={standings.length} />
          <Stat label="Soal dimainkan" value={`${replay.length}/${questionCount}`} />
          <Stat label="Rata-rata ketepatan" value={average === null ? "–" : `${average}%`} />
          <Stat label="Skor tertinggi" value={standings[0]?.score ?? "–"} />
        </dl>

        <section className="flex flex-col gap-3" aria-labelledby="standings-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="standings-title" className="text-lg font-semibold">
              Klasemen akhir
            </h2>
            <Button asChild variant="secondary" size="sm">
              <a href={`${csv}?kind=standings`} download>
                <Download /> Unduh CSV
              </a>
            </Button>
          </div>
          {standings.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-fg-muted">
              Belum ada peserta.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-line text-xs text-fg-subtle">
                  <tr>
                    {headers.map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {standings.map((r) => (
                    <tr key={r.id}>
                      <td className="px-4 py-3 font-semibold tabular-nums">{r.rank}</td>
                      <td className="px-4 py-3 font-medium">{r.nickname}</td>
                      <td className="px-4 py-3 font-semibold tabular-nums">{r.score}</td>
                      {battle && <td className="px-4 py-3 tabular-nums">{r.wins ?? 0}</td>}
                      <td className="px-4 py-3 tabular-nums">
                        {r.correct}/{replay.length}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{r.accuracy}%</td>
                      <td className="px-4 py-3 text-fg-muted tabular-nums">
                        {seconds(r.avgTimeMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {replay.length > 0 && standings.length > 0 && (
          <section className="flex flex-col gap-3" aria-labelledby="replay-title">
            <h2 id="replay-title" className="text-lg font-semibold">
              Replay papan skor
            </h2>
            <LeaderboardReplay frames={replay} />
          </section>
        )}

        <section className="flex flex-col gap-3" aria-labelledby="items-title">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="items-title" className="text-lg font-semibold">
              Analisis butir soal
            </h2>
            <Button asChild variant="secondary" size="sm">
              <a href={`${csv}?kind=items`} download>
                <Download /> Unduh CSV
              </a>
            </Button>
          </div>
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-fg-muted">
              Analisis muncul setelah soal pertama dimainkan.
            </p>
          ) : (
            <ItemAnalysis items={items} />
          )}
        </section>
      </main>
    </>
  );
}
