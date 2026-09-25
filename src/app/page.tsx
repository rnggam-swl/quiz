import Link from "next/link";

import { AnswerShape, ANSWER_SLOTS } from "@/components/player/AnswerShape";
import { site } from "@/lib/site";

const modes = [
  { title: "Latihan", body: "Kerjakan kapan saja lewat link, kode, atau embed." },
  { title: "Ujian", body: "Terjadwal, timer dari server, soal diacak per peserta." },
  { title: "Live", body: "Guru memandu dari proyektor, peserta menjawab di HP." },
  { title: "Battle", body: "Rebutan jawaban tercepat atau battle royale dengan nyawa." },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-4 py-16 sm:px-6">
      <header className="flex flex-col gap-4">
        <div className="flex gap-2" aria-hidden>
          {ANSWER_SLOTS.map((slot, i) => (
            <span key={slot} className="animate-pop" style={{ animationDelay: `${i * 60}ms` }}>
              <AnswerShape slot={slot} className="size-8 rounded-lg p-1.5" />
            </span>
          ))}
        </div>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {site.name}
        </h1>
        <p className="max-w-xl text-lg text-pretty text-fg-muted">{site.tagline}</p>
      </header>

      <ul className="grid gap-3 sm:grid-cols-2">
        {modes.map((mode) => (
          <li key={mode.title} className="rounded-xl border border-line bg-surface p-4 shadow-card">
            <h2 className="font-semibold">{mode.title}</h2>
            <p className="mt-1 text-sm text-fg-muted">{mode.body}</p>
          </li>
        ))}
      </ul>

      <p className="text-sm text-fg-subtle">
        Sedang dibangun — fase P0 (fondasi).
        {process.env.NODE_ENV !== "production" && (
          <>
            {" "}
            Lihat komponen di{" "}
            <Link href="/playground" className="font-medium text-accent-fg underline">
              /playground
            </Link>
            .
          </>
        )}
      </p>
    </main>
  );
}
