import type { Metadata } from "next";
import Link from "next/link";

import { AnswerShape, ANSWER_SLOTS } from "@/components/player/AnswerShape";
import { site } from "@/lib/site";

import { JoinCodeForm } from "./JoinCodeForm";

export const metadata: Metadata = { title: "Gabung" };

export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const { code } = await searchParams;
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 bg-theme-bg px-4 py-12">
      <Link href="/" className="flex flex-col items-center gap-3">
        <span className="flex gap-1.5" aria-hidden>
          {ANSWER_SLOTS.slice(0, 4).map((slot) => (
            <AnswerShape key={slot} slot={slot} className="size-7 rounded-lg p-1.5" />
          ))}
        </span>
        <span className="text-xl font-semibold">{site.name}</span>
      </Link>
      <JoinCodeForm initialCode={typeof code === "string" ? code : ""} />
    </main>
  );
}
