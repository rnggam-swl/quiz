import { Copy, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { HostHeader } from "@/components/host/HostHeader";
import { PublicHeader } from "@/components/host/PublicHeader";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { getSessionUser } from "@/lib/auth";
import { themeScheme, themeStyle, type QuizTheme } from "@/lib/theme";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Library quiz",
  description: "Quiz yang dibagikan guru lain. Lihat, coba, lalu salin ke akunmu.",
};

const PAGE_SIZE = 24;

export default async function LibraryPage({ searchParams }: PageProps<"/library">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const page = Math.max(1, Math.min(100, Number(params.page) || 1));

  const user = await getSessionUser();
  const host = user && !user.isAnonymous ? user : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("library_quizzes", {
    ...(query && { p_query: query }),
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  if (error) throw new Error("Gagal memuat library.");
  const quizzes = data ?? [];
  const total = Number(quizzes[0]?.total ?? 0);
  const pages = Math.ceil(total / PAGE_SIZE);
  const href = (n: number) =>
    `/library?${new URLSearchParams({ ...(query && { q: query }), ...(n > 1 && { page: String(n) }) })}`;

  return (
    <>
      {host ? <HostHeader email={host.email} /> : <PublicHeader loginNext="/library" />}
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto flex flex-col gap-1">
            <h1 className="text-2xl font-semibold">Library quiz</h1>
            <p className="text-sm text-fg-muted">
              Quiz yang dibagikan guru lain. Lihat isinya, coba mainkan, lalu salin ke akunmu.
            </p>
          </div>
          <form role="search" className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              name="q"
              defaultValue={query}
              placeholder="Cari topik, misalnya pecahan…"
              aria-label="Cari di library"
              className="pl-9"
            />
          </form>
        </div>

        {quizzes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line-strong px-6 py-16 text-center">
            <p className="font-medium">
              {query ? `Belum ada quiz publik tentang “${query}”.` : "Library masih kosong."}
            </p>
            <p className="max-w-sm text-sm text-fg-muted">
              Guru bisa membagikan quiz yang sudah terbit lewat <strong>Bagikan → Library</strong>{" "}
              di editor.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => (
              <li
                key={quiz.id}
                className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition-shadow hover:shadow-pop"
              >
                <Link href={`/library/${quiz.id}`} className="flex h-full flex-col">
                  <div
                    className="flex aspect-[16/7] items-center justify-center bg-theme-bg"
                    style={themeStyle(quiz.theme as QuizTheme)}
                    data-scheme={themeScheme(quiz.theme as QuizTheme)}
                  >
                    {quiz.cover_url ? (
                      // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
                      <img src={quiz.cover_url} alt="" className="size-full object-cover" />
                    ) : (
                      <span className="size-10 rounded-xl bg-theme opacity-80" aria-hidden />
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-1 p-4">
                    <h2 className="truncate font-semibold">{quiz.title || "Quiz tanpa judul"}</h2>
                    {quiz.description && (
                      <p className="line-clamp-2 text-sm text-fg-muted">{quiz.description}</p>
                    )}
                    <p className="mt-auto flex flex-wrap items-center gap-x-2 pt-2 text-xs text-fg-subtle">
                      <span>{quiz.question_count} soal</span>·<span>{quiz.author}</span>
                      {Number(quiz.copies) > 0 && (
                        <>
                          ·
                          <span className="inline-flex items-center gap-1">
                            <Copy className="size-3" aria-hidden /> {quiz.copies}× disalin
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {pages > 1 && (
          <nav className="flex items-center justify-center gap-3" aria-label="Halaman">
            {page > 1 && (
              <Button asChild variant="secondary" size="sm">
                <Link href={href(page - 1)}>Sebelumnya</Link>
              </Button>
            )}
            <span className="text-sm text-fg-muted">
              Halaman {page} dari {pages}
            </span>
            {page < pages && (
              <Button asChild variant="secondary" size="sm">
                <Link href={href(page + 1)}>Berikutnya</Link>
              </Button>
            )}
          </nav>
        )}
      </main>
    </>
  );
}
