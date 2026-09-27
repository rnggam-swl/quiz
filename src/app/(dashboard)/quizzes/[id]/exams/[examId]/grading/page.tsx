import type { Metadata } from "next";
import Link from "next/link";

import { cn } from "@/lib/cn";
import { getDefinition } from "@/questions/registry";

import { loadAttempts, loadHostExam, loadParticipants, loadResponses } from "../../data";
import { GradingQueue, type GradingItem } from "./GradingQueue";

export const metadata: Metadata = { title: "Penilaian" };

export default async function GradingPage({
  params,
  searchParams,
}: PageProps<"/quizzes/[id]/exams/[examId]/grading">) {
  const { id, examId } = await params;
  const { q } = await searchParams;
  const { supabase, snapshot } = await loadHostExam(id, examId);

  // Questions graded by hand (essays), in the quiz's order.
  const manual = snapshot.questions
    .map((question, i) => ({ question, number: i + 1 }))
    .filter(({ question }) => getDefinition(question.type).capabilities.manualGrading);

  if (manual.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
        Tidak ada soal yang dinilai manual di ujian ini. Semua jawaban dinilai otomatis.
      </p>
    );
  }

  const [participants, attempts, responses] = await Promise.all([
    loadParticipants(supabase, examId),
    loadAttempts(supabase, examId),
    loadResponses(supabase, examId, true),
  ]);
  const manualIds = new Set(manual.map((m) => m.question.id));
  const names = new Map(participants.map((p) => [p.id, p.nickname]));
  // Only finished attempts: a running one may still change its answer.
  const closed = new Map(attempts.filter((a) => a.status !== "in_progress").map((a) => [a.id, a]));
  const gradable = responses.filter(
    (r) => manualIds.has(r.question_id) && closed.has(r.attempt_id),
  );

  const counts = new Map<string, { pending: number; graded: number }>();
  for (const r of gradable) {
    const c = counts.get(r.question_id) ?? { pending: 0, graded: 0 };
    if (r.correct === null) c.pending++;
    else c.graded++;
    counts.set(r.question_id, c);
  }

  const selected =
    manual.find((m) => m.question.id === q) ??
    manual.find((m) => (counts.get(m.question.id)?.pending ?? 0) > 0) ??
    manual[0]!;

  const items: GradingItem[] = gradable
    .filter((r) => r.question_id === selected.question.id)
    .map((r) => {
      const attempt = closed.get(r.attempt_id)!;
      const answer = r.answer as { text?: unknown } | null;
      return {
        responseId: r.id,
        participant: names.get(attempt.participant_id) ?? "Peserta",
        attemptNo: attempt.attempt_no,
        text: typeof answer?.text === "string" ? answer.text : "",
        graded: r.correct !== null,
        ratio: r.correct === null ? null : Number(r.correct) / (Number(r.total) || 1),
        points: r.points,
        feedback: r.feedback ?? "",
        rubricScores: Array.isArray(r.rubric_scores)
          ? Object.fromEntries(
              (r.rubric_scores as { id: string; score: number }[]).map((s) => [s.id, s.score]),
            )
          : {},
      };
    })
    .sort(
      (a, b) =>
        Number(a.graded) - Number(b.graded) || a.participant.localeCompare(b.participant, "id"),
    );

  return (
    <section className="grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]" aria-label="Penilaian">
      <nav aria-label="Soal esai" className="flex flex-col gap-1">
        {manual.map(({ question, number }) => {
          const c = counts.get(question.id) ?? { pending: 0, graded: 0 };
          const active = question.id === selected.question.id;
          return (
            <Link
              key={question.id}
              href={`?q=${question.id}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-sm transition-colors",
                active
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface hover:bg-surface-muted",
              )}
            >
              <span className="font-medium">Soal {number}</span>
              <span className="line-clamp-2 text-xs text-fg-muted">
                {question.prompt || "(tanpa teks)"}
              </span>
              <span className={cn("text-xs", c.pending ? "text-warning" : "text-success")}>
                {c.pending ? `${c.pending} belum dinilai` : "Semua sudah dinilai"}
                {c.graded > 0 && c.pending > 0 && ` · ${c.graded} sudah`}
              </span>
            </Link>
          );
        })}
      </nav>
      <GradingQueue
        key={selected.question.id}
        examId={examId}
        number={selected.number}
        prompt={selected.question.prompt}
        points={selected.question.points}
        config={selected.question.config as never}
        items={items}
      />
    </section>
  );
}
