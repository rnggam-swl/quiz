import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaygroundLive } from "./PlaygroundLive";

export const metadata: Metadata = { title: "Live (playground)" };

/**
 * Live mode on the in-memory engine: projector + two phones + bots.
 * ?auto=1 = auto-advance, ?mode=rebutan = Rebutan (penalty 100).
 */
export default async function PlaygroundLivePage({ searchParams }: PageProps<"/playground/live">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return (
    <PlaygroundLive
      auto={params.auto === "1"}
      mode={params.mode === "rebutan" ? "battle_buzzer" : "live"}
    />
  );
}
