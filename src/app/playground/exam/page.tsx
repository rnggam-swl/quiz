import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaygroundExam } from "./PlaygroundExam";

export const metadata: Metadata = { title: "Ujian (playground)" };

/**
 * The exam player on the in-memory engine. ?duration=90 (seconds), ?navigation=forward,
 * ?access=roster (NIS 1001/1002), ?passcode=IPA8, ?release=manual, ?fullscreen=0.
 */
export default async function PlaygroundExamPage({ searchParams }: PageProps<"/playground/exam">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const text = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  return (
    <PlaygroundExam
      durationS={Number(text(params.duration)) || 600}
      navigation={text(params.navigation) === "forward" ? "forward" : "free"}
      access={text(params.access) === "roster" ? "roster" : "open"}
      passcode={text(params.passcode)}
      release={text(params.release) === "manual" ? "manual" : "immediately"}
      fullscreen={text(params.fullscreen) !== "0"}
    />
  );
}
