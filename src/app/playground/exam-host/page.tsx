import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ExamWizard } from "@/app/(dashboard)/quizzes/[id]/exams/new/ExamWizard";
import { GradingQueue } from "@/app/(dashboard)/quizzes/[id]/exams/[examId]/grading/GradingQueue";
import { ItemAnalysis } from "@/app/(dashboard)/quizzes/[id]/exams/[examId]/report/ItemAnalysis";
import { RosterPanel } from "@/app/(dashboard)/quizzes/[id]/exams/[examId]/roster/RosterPanel";
import { itemAnalysis, type ItemResponse } from "@/engine/exam/report";
import { snapshotFromDraft } from "@/engine/practice/snapshot";
import type { EssayConfig } from "@/questions/essay/definition";

import { sampleQuiz } from "../sample";

export const metadata: Metadata = { title: "Ujian guru (playground)" };

const FAKE_ID = "00000000-0000-4000-8000-000000000000";

/** Made-up answers from eight participants, for the item analysis. */
function fakeResponses(questions: ReturnType<typeof snapshotFromDraft>["questions"]) {
  const out: ItemResponse[] = [];
  for (const q of questions) {
    const config = q.config as Record<string, unknown>;
    for (let k = 0; k < 8; k++) {
      let answer: unknown = {};
      let correct: number | null = k % 3 === 0 ? 0 : 1;
      if (q.type === "multiple_choice") {
        const options = config.options as { id: string }[];
        const pick = options[(k * 7) % options.length]!.id;
        answer = { selectedIds: [pick] };
        correct = (config.correctIds as string[]).includes(pick) ? 1 : 0;
      } else if (q.type === "true_false") {
        answer = { value: k % 4 !== 0 };
        correct = answer && (answer as { value: boolean }).value === config.correct ? 1 : 0;
      } else if (q.type === "essay") {
        correct = k < 3 ? 0.75 : null;
      }
      out.push({ questionId: q.id, answer, correct, total: 1, timeMs: 8000 + k * 2500 });
    }
  }
  return out;
}

/** The host's exam screens with sample data (no database; saving needs a real exam). */
export default function PlaygroundExamHostPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const { quiz, questions } = sampleQuiz("exam");
  const snapshot = snapshotFromDraft(quiz, questions);
  const essay = snapshot.questions.find((q) => q.type === "essay")!;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
      <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm">
        Playground: tombol simpan memanggil Server Action sungguhan dan butuh login + ujian nyata.
      </p>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Buat ujian</h2>
        <div className="max-w-3xl">
          <ExamWizard
            quizId={FAKE_ID}
            defaultTitle={quiz.title}
            questionCount={snapshot.questions.length}
            tags={[
              { tag: "bab 1", count: 4 },
              { tag: "bab 2", count: 3 },
            ]}
            questionTags={snapshot.questions.map((_, i) => [i % 2 ? "bab 1" : "bab 2"])}
            compat={[
              {
                number: snapshot.questions.findIndex((q) => q.type === "branching") + 1,
                typeLabel: "Cerita Bercabang",
                level: "warn",
                note: "Di ujian, node dikirim satu per satu agar peserta tidak bisa mengintip cabang lain.",
              },
            ]}
          />
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Penilaian esai</h2>
        <GradingQueue
          examId={FAKE_ID}
          number={snapshot.questions.indexOf(essay) + 1}
          prompt={essay.prompt}
          points={essay.points}
          config={essay.config as EssayConfig}
          items={[
            {
              responseId: "r1",
              participant: "Ani Wijaya",
              attemptNo: 1,
              text: "Tumbuhan membutuhkan cahaya matahari untuk fotosintesis. Cahaya mengubah air dan karbon dioksida menjadi glukosa dan oksigen.",
              graded: false,
              ratio: null,
              points: 0,
              feedback: "",
              rubricScores: {},
            },
            {
              responseId: "r2",
              participant: "Budi Santoso",
              attemptNo: 2,
              text: "Supaya daunnya hijau.",
              graded: true,
              ratio: 0.25,
              points: 0,
              feedback: "Sebutkan prosesnya.",
              rubricScores: { isi: 0, bahasa: 1 },
            },
          ]}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Daftar peserta</h2>
        <RosterPanel
          examId={FAKE_ID}
          entries={[
            { id: "a", name: "Ani Wijaya", identifier: "1001", extraTimePct: 0, joined: true },
            { id: "b", name: "Budi Santoso", identifier: "1002", extraTimePct: 25, joined: false },
          ]}
        />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Analisis butir soal</h2>
        <ItemAnalysis items={itemAnalysis(snapshot.questions, fakeResponses(snapshot.questions))} />
      </section>
    </main>
  );
}
