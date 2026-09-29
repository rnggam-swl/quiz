import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaygroundLive } from "./PlaygroundLive";

export const metadata: Metadata = { title: "Live (playground)" };

/**
 * Live mode on the in-memory engine: projector + two phones + bots.
 * ?auto=1 = auto-advance, ?mode=rebutan = Rebutan (penalty 100), ?mode=royale = Battle Royale
 * (2 lives, the zone shrinks 20% a round, sudden death).
 */
export default async function PlaygroundLivePage({ searchParams }: PageProps<"/playground/live">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return (
    <PlaygroundLive
      auto={params.auto === "1"}
      mode={
        params.mode === "rebutan"
          ? "battle_buzzer"
          : params.mode === "royale"
            ? "battle_royale"
            : "live"
      }
    />
  );
}
