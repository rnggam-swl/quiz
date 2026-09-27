import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";

import { HostHeader } from "@/components/host/HostHeader";
import { CopyField } from "@/components/ui/CopyField";
import { resultsReleased } from "@/engine/exam/attempt";
import { poolCandidates } from "@/engine/practice/attempt";

import { loadHostExam } from "../data";
import { ExamWindow, PhaseBadge } from "../parts";
import { ExamActions } from "./ExamActions";
import { ExamTabs } from "./ExamTabs";

const ACCESS = { open: "Siapa saja", login: "Wajib masuk", roster: "Daftar peserta" } as const;

export default async function ExamLayout({
  params,
  children,
}: LayoutProps<"/quizzes/[id]/exams/[examId]">) {
  const { id, examId } = await params;
  const { user, session, policy, snapshot, phase } = await loadHostExam(id, examId);

  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost"}`;
  const questionCount = policy.questionPool
    ? Math.min(policy.questionPool.size, poolCandidates(snapshot, policy).length)
    : snapshot.questions.length;
  const minutes = policy.timer.totalS ? Math.round(policy.timer.totalS / 60) : null;
  const base = `/quizzes/${id}/exams/${examId}`;

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4">
          <Link
            href={`/quizzes/${id}/exams`}
            className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg"
          >
            <ArrowLeft className="size-4" /> Daftar ujian
          </Link>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold">
                <span className="min-w-0 break-words">
                  {session.title || session.quizzes.title || "Ujian"}
                </span>
                <PhaseBadge phase={phase} />
              </h1>
              <p className="text-sm text-fg-muted">
                <ExamWindow opensAt={session.opens_at} closesAt={session.closes_at} />
                {" · "}
                {minutes ? `${minutes} menit` : "Tanpa batas waktu"} · {questionCount} soal
                {policy.questionPool && ` (dari ${snapshot.questions.length})`} ·{" "}
                {ACCESS[policy.access]}
                {policy.passcode && " + kode akses"}
              </p>
            </div>
            <ExamActions
              examId={examId}
              quizId={id}
              closed={phase === "closed"}
              releaseMode={policy.releaseResults}
              released={resultsReleased(policy, session)}
              manuallyReleased={!!session.results_released_at}
            />
          </div>
          {phase !== "closed" && (
            <div className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-[auto_1fr] sm:items-center">
              {session.code && (
                <div className="flex flex-col">
                  <span className="text-xs text-fg-subtle">Kode di /join</span>
                  <span className="font-mono text-2xl font-semibold tracking-widest">
                    {session.code}
                  </span>
                </div>
              )}
              <CopyField value={`${origin}/exam/${examId}`} label="Link ujian" />
            </div>
          )}
        </div>
        <ExamTabs base={base} showRoster={policy.access === "roster"} />
        {children}
      </main>
    </>
  );
}
