import { ArrowLeft, Copy, Play } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { HostHeader } from "@/components/host/HostHeader";
import { PublicHeader } from "@/components/host/PublicHeader";
import { Button } from "@/components/ui/Button";
import { LocalTime } from "@/components/ui/LocalTime";
import { getSessionUser } from "@/lib/auth";
import { themeScheme, themeStyle, type QuizTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/server";
import { isQuestionType, questionDefinitions } from "@/questions/registry";

import { copyLibraryQuizAction } from "../actions";

type LibraryQuiz = {
  id: string;
  visibility: "public" | "unlisted";
  title: string;
  description: string;
  cover_url: string | null;
  theme: QuizTheme;
  author: string;
  version: number;
  published_at: string;
  copies: number;
  practice_code: string | null;
  questions: { type: string; prompt: string; points: number; image: string | null }[];
};

const loadQuiz = cache(async (id: string): Promise<LibraryQuiz | null> => {
  if (!z.uuid().safeParse(id).success) return null;
  const supabase = await createClient();
  const { data } = await supabase.rpc("library_quiz", { p_quiz_id: id });
  return (data as LibraryQuiz | null) ?? null;
});

export async function generateMetadata({ params }: PageProps<"/library/[id]">): Promise<Metadata> {
  const quiz = await loadQuiz((await params).id);
  if (!quiz) return { title: "Library quiz" };
  return {
    title: quiz.title || "Quiz tanpa judul",
    description: quiz.description || `${quiz.questions.length} soal oleh ${quiz.author}`,
    // Unlisted quizzes are for people with the link, not search engines.
    robots: quiz.visibility === "unlisted" ? { index: false } : undefined,
  };
}

export default async function LibraryQuizPage({
  params,
  searchParams,
}: PageProps<"/library/[id]">) {
  const { id } = await params;
  const { error } = await searchParams;
  const quiz = await loadQuiz(id);
  if (!quiz) notFound();
  const user = await getSessionUser();
  const host = user && !user.isAnonymous ? user : null;

  return (
    <>
      {host ? <HostHeader email={host.email} /> : <PublicHeader loginNext={`/library/${id}`} />}
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
        <Link
          href="/library"
          className="inline-flex items-center gap-1 self-start text-sm text-fg-subtle hover:text-fg"
        >
          <ArrowLeft className="size-4" /> Library
        </Link>

        <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
          <div
            className="flex aspect-[16/5] items-center justify-center bg-theme-bg"
            style={themeStyle(quiz.theme)}
            data-scheme={themeScheme(quiz.theme)}
          >
            {quiz.cover_url ? (
              // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
              <img src={quiz.cover_url} alt="" className="size-full object-cover" />
            ) : (
              <span className="size-12 rounded-xl bg-theme opacity-80" aria-hidden />
            )}
          </div>
          <div className="flex flex-col gap-4 p-6">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-semibold text-balance">
                {quiz.title || "Quiz tanpa judul"}
              </h1>
              <p className="text-sm text-fg-subtle">
                {quiz.questions.length} soal · oleh {quiz.author} · versi {quiz.version},{" "}
                <LocalTime iso={quiz.published_at} options={{ dateStyle: "medium" }} />
                {quiz.copies > 0 && ` · ${quiz.copies}× disalin`}
              </p>
            </div>
            {quiz.description && (
              <p className="whitespace-pre-line text-fg-muted">{quiz.description}</p>
            )}

            {error === "copy" && (
              <p role="alert" className="rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
                Quiz gagal disalin. Coba lagi.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {host ? (
                <form action={copyLibraryQuizAction}>
                  <input type="hidden" name="quizId" value={quiz.id} />
                  <Button type="submit">
                    <Copy /> Salin ke quiz saya
                  </Button>
                </form>
              ) : (
                <Button asChild>
                  <Link href={`/login?next=${encodeURIComponent(`/library/${quiz.id}`)}`}>
                    <Copy /> Masuk untuk menyalin
                  </Link>
                </Button>
              )}
              {quiz.practice_code && (
                <Button asChild variant="secondary">
                  <Link href={`/play/${quiz.practice_code}`}>
                    <Play /> Coba mainkan
                  </Link>
                </Button>
              )}
            </div>
            <p className="text-xs text-fg-subtle">
              Salinan menjadi draf pribadi di akunmu, lengkap dengan kunci jawaban, dan bisa kamu
              ubah sesukamu.
            </p>
          </div>
        </article>

        <section className="flex flex-col gap-3" aria-labelledby="questions">
          <h2 id="questions" className="font-semibold">
            Soal
          </h2>
          <ol className="flex flex-col gap-2">
            {quiz.questions.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl border border-line bg-surface p-4"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-sm font-semibold tabular-nums">
                  {i + 1}
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-pretty">{q.prompt || "(tanpa teks pertanyaan)"}</p>
                  <p className="text-xs text-fg-subtle">
                    {isQuestionType(q.type) ? questionDefinitions[q.type].label : q.type} ·{" "}
                    {q.points} poin
                  </p>
                </div>
                {q.image && (
                  // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
                  <img src={q.image} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
                )}
              </li>
            ))}
          </ol>
        </section>
      </main>
    </>
  );
}
