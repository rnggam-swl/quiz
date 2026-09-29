import { ArrowLeft, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { HostHeader } from "@/components/host/HostHeader";
import { Button } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { liveQuestions } from "@/engine/live/form";
import { parseSnapshot, type Snapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GAME_MODES, type GameMode } from "@/engine/live/types";

import { Badge } from "../exams/parts";
import { StartLiveButton, type ModeQuestions } from "./StartLiveButton";

function listFor(snapshot: Snapshot | null, mode: GameMode) {
  if (!snapshot) return { playable: 0, skipped: [], warned: [] };
  const { playable, skipped, warned } = liveQuestions(snapshot, mode);
  return { playable: playable.length, skipped, warned };
}

const MODE_LABEL: Record<string, string> = {
  live: "Live",
  battle_buzzer: "Rebutan",
  battle_royale: "Battle Royale",
};

export const metadata: Metadata = { title: "Live" };

const PHASE_LABEL: Record<string, { label: string; tone: string }> = {
  lobby: { label: "Lobby", tone: "bg-accent-soft text-accent-fg" },
  ended: { label: "Selesai", tone: "bg-surface-muted text-fg-muted" },
};
const RUNNING = { label: "Berlangsung", tone: "bg-success-soft text-success" };

export default async function LiveSessionsPage({ params }: PageProps<"/quizzes/[id]/live">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireHost(`/quizzes/${id}/live`);
  const supabase = await createClient();

  const [{ data: quiz }, { data: version }, { data: sessions, error }] = await Promise.all([
    supabase.from("quizzes").select("id, title").eq("id", id).maybeSingle(),
    supabase
      .from("quiz_versions")
      .select("snapshot")
      .eq("quiz_id", id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("sessions")
      .select("id, mode, code, phase, created_at, question_ids, participants(count)")
      .eq("quiz_id", id)
      .in("mode", GAME_MODES)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  if (!quiz || error) notFound();
  const snapshot = parseSnapshot(version?.snapshot);
  const questions: ModeQuestions = {
    live: listFor(snapshot, "live"),
    battle_buzzer: listFor(snapshot, "battle_buzzer"),
  };
  const playable = Math.max(questions.live.playable, questions.battle_buzzer.playable);

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
            <h1 className="text-2xl font-semibold">
              Live & Rebutan · {quiz.title || "Quiz tanpa judul"}
            </h1>
            <p className="text-sm text-fg-muted">
              Soal tampil di proyektor, peserta menjawab di HP: live klasik (ketepatan dan
              kecepatan) atau rebutan (yang tercepat benar menang).
            </p>
          </div>
          {snapshot && playable > 0 && <StartLiveButton quizId={id} questions={questions} />}
        </div>

        {!snapshot ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
            Publish quiz ini dulu di editor untuk memainkannya secara live.
          </p>
        ) : playable === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
            Tidak ada soal di quiz ini yang bisa dimainkan secara live.
          </p>
        ) : !sessions?.length ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
            Belum ada sesi live. Tekan <strong>Mulai live</strong> untuk membuka lobby.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => {
              const ended = s.phase === "ended";
              const badge = PHASE_LABEL[s.phase ?? ""] ?? RUNNING;
              return (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-line bg-surface p-4 shadow-card"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="flex items-center gap-2 font-semibold">
                      <LocalTime iso={s.created_at} />
                      <Badge tone="bg-surface-muted text-fg">{MODE_LABEL[s.mode] ?? s.mode}</Badge>
                      <Badge tone={badge.tone}>{badge.label}</Badge>
                    </span>
                    <span className="text-sm text-fg-subtle">
                      {s.participants[0]?.count ?? 0} peserta · {s.question_ids?.length ?? 0} soal
                      {!ended && s.code && ` · kode ${s.code}`}
                    </span>
                  </div>
                  {!ended && (
                    <Button asChild variant="secondary">
                      <Link href={`/host/${s.id}`}>
                        <MonitorPlay /> Buka layar host
                      </Link>
                    </Button>
                  )}
                  <Button asChild variant="ghost">
                    <Link href={`/quizzes/${id}/live/${s.id}`}>Laporan</Link>
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
