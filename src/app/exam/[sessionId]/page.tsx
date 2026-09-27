import type { Metadata } from "next";
import Link from "next/link";

import { examInfo, loadExam } from "@/engine/exam/server";

import { ExamClient } from "./ExamClient";

export const metadata: Metadata = { title: "Ujian" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ExamPage({ params }: PageProps<"/exam/[sessionId]">) {
  const { sessionId } = await params;
  const ctx = UUID.test(sessionId) ? await loadExam(sessionId) : null;

  if (!ctx) {
    return (
      <main className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🔍
        </p>
        <h1 className="text-xl font-semibold">Ujian tidak ditemukan</h1>
        <p className="text-fg-muted">Periksa lagi link atau kode dari gurumu.</p>
        <Link href="/join" className="font-medium text-accent-fg underline">
          Masukkan kode
        </Link>
      </main>
    );
  }

  // Closed exams stay reachable: participants come back here for their results.
  return <ExamClient info={examInfo(ctx)} />;
}
