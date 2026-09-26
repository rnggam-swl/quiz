import { Plus, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HostHeader } from "@/components/host/HostHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { requireHost } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { escapeLike, timeAgo } from "@/lib/format";
import { themeStyle, type QuizTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/server";

import { createQuizAction } from "./actions";
import { QuizCardMenu } from "./QuizCardMenu";

export const metadata: Metadata = { title: "Quiz saya" };

export default async function QuizzesPage({ searchParams }: PageProps<"/quizzes">) {
  const user = await requireHost("/quizzes");
  const { q } = await searchParams;
  const query = typeof q === "string" ? q.trim().slice(0, 100) : "";

  const supabase = await createClient();
  let request = supabase
    .from("quizzes")
    .select(
      "id, title, cover_url, theme, updated_at, latest_version, draft_revision, published_revision, questions(count)",
    )
    .order("updated_at", { ascending: false })
    .limit(100);
  if (query) request = request.ilike("title", `%${escapeLike(query)}%`);
  const { data: quizzes, error } = await request;
  if (error) throw new Error("Gagal memuat daftar quiz.");

  return (
    <>
      <HostHeader email={user.email} />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="mr-auto text-2xl font-semibold">Quiz saya</h1>
          <form role="search" className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Cari judul…"
              aria-label="Cari quiz"
              className="pl-9"
            />
          </form>
          <form action={createQuizAction}>
            <Button type="submit">
              <Plus /> Quiz baru
            </Button>
          </form>
        </div>

        {quizzes.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
            {query ? (
              <>
                <p className="font-medium">Tidak ada quiz dengan judul “{query}”.</p>
                <Link href="/quizzes" className="text-sm text-accent-fg underline">
                  Tampilkan semua
                </Link>
              </>
            ) : (
              <>
                <p className="text-lg font-medium">Belum ada quiz</p>
                <p className="max-w-sm text-sm text-fg-muted">
                  Buat quiz pertamamu. Bisa dipakai untuk latihan, ujian, live di kelas, atau
                  battle.
                </p>
                <form action={createQuizAction}>
                  <Button type="submit" size="lg">
                    <Plus /> Buat quiz
                  </Button>
                </form>
              </>
            )}
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => {
              const count = quiz.questions[0]?.count ?? 0;
              const status =
                quiz.latest_version === null
                  ? { label: "Draf", tone: "bg-surface-muted text-fg-muted" }
                  : quiz.published_revision === quiz.draft_revision
                    ? {
                        label: `Terbit · v${quiz.latest_version}`,
                        tone: "bg-success-soft text-success",
                      }
                    : { label: "Ada perubahan", tone: "bg-warning-soft text-warning" };
              return (
                <li
                  key={quiz.id}
                  className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-pop"
                >
                  <Link href={`/quizzes/${quiz.id}/edit`} className="flex flex-1 flex-col">
                    <div
                      className="flex aspect-[16/7] items-center justify-center bg-theme-bg"
                      style={themeStyle(quiz.theme as QuizTheme)}
                    >
                      {quiz.cover_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
                        <img src={quiz.cover_url} alt="" className="size-full object-cover" />
                      ) : (
                        <span className="size-10 rounded-xl bg-theme opacity-80" aria-hidden />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 p-4">
                      <h2
                        className={cn(
                          "truncate font-semibold",
                          !quiz.title && "text-fg-subtle italic",
                        )}
                      >
                        {quiz.title || "Quiz tanpa judul"}
                      </h2>
                      <p className="text-xs text-fg-subtle">
                        {count} soal · diubah {timeAgo(quiz.updated_at)}
                      </p>
                    </div>
                  </Link>
                  <div className="flex items-center justify-between px-4 pb-4">
                    <span
                      className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", status.tone)}
                    >
                      {status.label}
                    </span>
                    <QuizCardMenu quizId={quiz.id} title={quiz.title} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </>
  );
}
