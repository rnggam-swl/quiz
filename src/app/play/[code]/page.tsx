import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { isSessionOpen, loadSessionByCode, playInfo } from "@/engine/practice/server";

import { PlayClient } from "./PlayClient";

export const metadata: Metadata = { title: "Main" };

export default async function PlayPage({ params }: PageProps<"/play/[code]">) {
  const { code } = await params;
  const ctx = await loadSessionByCode(code);

  // Exams have their own page, which also shows them before they open.
  if (ctx?.session.mode === "exam") redirect(`/exam/${ctx.session.id}`);

  if (!ctx || !isSessionOpen(ctx)) {
    return (
      <main className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        <p className="text-4xl" aria-hidden>
          🔍
        </p>
        <h1 className="text-xl font-semibold">Kode {code} tidak ditemukan</h1>
        <p className="text-fg-muted">
          Mungkin kodenya salah ketik, atau sesinya sudah ditutup guru.
        </p>
        <Link href="/join" className="font-medium text-accent-fg underline">
          Masukkan kode lain
        </Link>
      </main>
    );
  }

  return <PlayClient sessionId={ctx.session.id} info={playInfo(ctx)} />;
}
