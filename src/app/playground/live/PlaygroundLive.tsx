"use client";

import { Bot, Wifi, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { HostScreen } from "@/components/live/HostScreen";
import { LivePlayer } from "@/components/live/LivePlayer";
import { Button } from "@/components/ui/Button";
import { DEFAULT_LIVE_FORM, livePolicyFrom, type LiveForm } from "@/engine/live/form";
import { createLocalLive } from "@/engine/live/local";
import { snapshotFromDraft } from "@/engine/practice/snapshot";
import { createMemoryHub } from "@/engine/transport/memory";
import type { LivePublicKey } from "@/engine/transport/signing";

import { sampleQuiz } from "../sample";

const BOT_NAMES = ["Ani", "Budi", "Caca", "Dodi", "Eka", "Fajar", "Gita", "Hana", "Indra", "Joko"];

/** The projector and two phones on one page, over the in-memory engine and hub. */
export function PlaygroundLive({ auto, mode }: { auto: boolean; mode: LiveForm["mode"] }) {
  const [{ hub, live, title }] = useState(() => {
    const { quiz, questions } = sampleQuiz("all");
    const snapshot = snapshotFromDraft(quiz, questions);
    const hub = createMemoryHub();
    const live = createLocalLive(
      snapshot,
      livePolicyFrom({
        ...DEFAULT_LIVE_FORM,
        mode,
        perQuestionS: 20,
        autoAdvance: auto,
        wrongPenalty: mode === "battle_buzzer" ? 100 : 0,
      }),
      { hub, mode },
    );
    return { hub, live, title: quiz.title };
  });
  const [bots, setBots] = useState(0);
  const [online, setOnline] = useState(true);
  const [publicKey, setPublicKey] = useState<LivePublicKey | null>(null);
  useEffect(() => {
    void live.publicKey.then(setPublicKey);
  }, [live]);

  return (
    <div className="flex min-h-dvh flex-col gap-3 bg-surface-muted p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <strong>Playground {mode === "battle_buzzer" ? "rebutan" : "live"}</strong>
        <span className="text-fg-muted">kode {live.code}</span>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => {
            for (let i = 0; i < 5; i++) live.addBot(BOT_NAMES[(bots + i) % BOT_NAMES.length]!);
            setBots(bots + 5);
          }}
        >
          <Bot /> Tambah 5 bot
        </Button>
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={!online}
          onClick={() => {
            hub.setOnline(!online);
            setOnline(!online);
          }}
        >
          {online ? <WifiOff /> : <Wifi />} {online ? "Putuskan realtime" : "Sambungkan lagi"}
        </Button>
      </div>
      <div className="grid flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_400px_400px]">
        <section
          aria-label="Layar host"
          className="h-[80dvh] overflow-auto rounded-xl border border-line bg-canvas"
        >
          <HostScreen
            sessionId={live.sessionId}
            adapter={live.host}
            openChannel={hub.open}
            joinUrl="http://localhost:3000/join"
            measureClock={false}
          />
        </section>
        {[1, 2].map((n) => (
          <section
            key={n}
            aria-label={`HP peserta ${n}`}
            className="h-[80dvh] overflow-auto rounded-[2rem] border-8 border-fg/80 bg-canvas"
          >
            <LivePlayer
              sessionId={live.sessionId}
              title={title}
              adapter={live.player}
              openChannel={hub.open}
              storageKey={null}
              publicKey={publicKey}
              mode={mode}
              measureClock={false}
            />
          </section>
        ))}
      </div>
    </div>
  );
}
