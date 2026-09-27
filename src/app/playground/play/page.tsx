import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaygroundPlay } from "./PlaygroundPlay";

export const metadata: Metadata = { title: "Player (playground)" };

/**
 * The practice player on the in-memory engine.
 * ?feedback=end, ?attempts=1, ?latency=800, ?set=core|advanced (default: every type).
 */
export default async function PlaygroundPlayPage({ searchParams }: PageProps<"/playground/play">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return (
    <PlaygroundPlay
      feedback={params.feedback === "end" ? "end" : "instant"}
      attempts={Number(params.attempts) || 0}
      latencyMs={Number(params.latency) || 300}
      set={params.set === "core" || params.set === "advanced" ? params.set : "all"}
    />
  );
}
