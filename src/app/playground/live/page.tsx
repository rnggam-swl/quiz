import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaygroundLive } from "./PlaygroundLive";

export const metadata: Metadata = { title: "Live (playground)" };

/**
 * Live mode on the in-memory engine: projector + two phones + bots.
 * ?auto=1 = auto-advance, ?mode=rebutan = Rebutan (penalty 100), ?mode=pencet = Rebutan
 * "Pencet lalu Jawab" (hold 5 s), ?mode=royale = Battle Royale (2 lives, the zone shrinks
 * 20% a round, sudden death). Add &teams=1 for two teams dealt automatically, &teams=choose
 * for three teams the phones pick.
 */
export default async function PlaygroundLivePage({ searchParams }: PageProps<"/playground/live">) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  return (
    <PlaygroundLive
      auto={params.auto === "1"}
      buzzVariant={params.mode === "pencet" ? "buzz_then_answer" : "first_correct"}
      teams={params.teams === "1" ? "auto" : params.teams === "choose" ? "choose" : null}
      mode={
        params.mode === "rebutan" || params.mode === "pencet"
          ? "battle_buzzer"
          : params.mode === "royale"
            ? "battle_royale"
            : "live"
      }
    />
  );
}
