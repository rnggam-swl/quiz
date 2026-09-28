"use client";

import {
  ChevronRight,
  Lock,
  LockOpen,
  Music,
  Pause,
  Play,
  Square,
  Users,
  VolumeX,
  Wifi,
  WifiOff,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { nextStepLabel, timedPhase } from "@/engine/live/phases";
import type { HostAction, HostView, LiveHostAdapter, RosterEntry } from "@/engine/live/types";
import { msUntil } from "@/engine/transport/clock";
import type { ChannelFactory, PresenceMember } from "@/engine/transport/types";
import { startLobbyMusic } from "@/lib/music";
import { playSound } from "@/lib/sound";

import { useChannel, useLiveState, useServerOffset } from "./hooks";
import {
  CountdownStage,
  LeaderboardStage,
  LobbyStage,
  PodiumStage,
  QuestionStage,
  RevealStage,
} from "./HostStages";

/**
 * The host's projector screen (P5-10 – P5-14): the phases on a big screen and the
 * controls. The host screen also runs the clock: when a timer ends — or everyone has
 * answered — it asks the server to move on; the server checks the time itself.
 */
export function HostScreen({
  sessionId,
  adapter,
  openChannel,
  joinUrl,
  reportHref,
  measureClock = true,
}: {
  sessionId: string;
  adapter: LiveHostAdapter;
  openChannel: ChannelFactory;
  /** Where participants type the code (…/join). */
  joinUrl: string;
  reportHref?: string;
  measureClock?: boolean;
}) {
  const channel = useChannel(openChannel, sessionId, "host");
  const offset = useServerOffset(measureClock);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [kick, setKick] = useState<RosterEntry | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [music, setMusic] = useState(false);

  const { view, setView, refresh, connected } = useLiveState<HostView>({
    fetchState: adapter.state,
    channel,
    pollMs: (v) => (!v ? null : v.phase === "open" ? 1000 : v.phase === "lobby" ? 4000 : 10_000),
  });

  // Presence: the host is on the channel too, and newcomers refresh the lobby.
  useEffect(() => {
    if (!channel) return;
    channel.track({ key: "host", nickname: "Host", role: "host" });
    return channel.onPresence(setMembers);
  }, [channel]);
  const online = useMemo(
    () => new Set(members.filter((m) => m.role === "player").map((m) => m.key)),
    [members],
  );
  const phase = view?.phase;
  useEffect(() => {
    if (phase !== "lobby") return;
    const timer = setTimeout(() => void refresh(), 300);
    return () => clearTimeout(timer);
  }, [online.size, phase, refresh]);

  // One request per version and action: double presses and timers racing are harmless.
  const pending = useRef<string | null>(null);
  const act = useCallback(
    async (action: HostAction) => {
      if (!view) return;
      const key = `${view.version}:${action}`;
      if (pending.current === key) return;
      pending.current = key;
      const result = await adapter.advance(view.version, action).catch(() => null);
      pending.current = null;
      if (result?.ok) setView(result.view);
      else if (action !== "auto") toast.error("Gagal. Coba lagi.");
    },
    [adapter, view, setView],
  );

  // Timers: the countdown and the question always, reveal and leaderboard with auto-advance.
  useEffect(() => {
    if (!view || view.paused || !timedPhase(view.phase, view.autoAdvance)) return;
    const ms = msUntil(view.phaseClosesAt, offset);
    if (ms === null) return;
    const timer = setTimeout(() => void act("auto"), ms + 100);
    return () => clearTimeout(timer);
  }, [view, offset, act]);

  // Everyone answered: close the question early (P5-08).
  useEffect(() => {
    if (
      view?.phase === "open" &&
      !view.paused &&
      view.players > 0 &&
      view.answered >= view.players
    ) {
      const timer = setTimeout(() => void act("next"), 600);
      return () => clearTimeout(timer);
    }
  }, [view, act]);

  // Space = next (P5-14), unless typing or on a button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, button, [role=switch], [contenteditable]"))
        return;
      e.preventDefault();
      void act("next");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [act]);

  // Lobby music, only after the host turned it on (autoplay rules).
  useEffect(() => {
    if (!music || phase !== "lobby") return;
    return startLobbyMusic();
  }, [music, phase]);

  // Podium: fanfare and confetti.
  useEffect(() => {
    if (phase !== "podium") return;
    playSound("fanfare");
    void import("canvas-confetti").then(({ default: confetti }) =>
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.6 },
        disableForReducedMotion: true,
      }),
    );
  }, [phase]);

  async function settings(patch: { lobbyLocked?: boolean; autoAdvance?: boolean }) {
    const result = await adapter.settings(patch).catch(() => null);
    if (result?.ok) setView(result.view);
    else toast.error("Gagal menyimpan.");
  }

  async function doKick(entry: RosterEntry) {
    setKick(null);
    const result = await adapter.kick(entry.id).catch(() => null);
    if (result?.ok) {
      setView(result.view);
      toast(`${entry.nickname} dikeluarkan.`);
    } else toast.error("Gagal mengeluarkan peserta.");
  }

  if (!view) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-fg-muted" role="status">
        Memuat sesi…
      </main>
    );
  }

  const canPause = ["countdown", "open", "reveal", "leaderboard"].includes(view.phase);
  const next = nextStepLabel(view.phase, view.round, view.questionCount);

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <header className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line bg-surface px-6 py-3">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{view.title}</h1>
        {view.phase !== "lobby" && view.phase !== "ended" && view.code && (
          <span className="text-sm text-fg-muted">
            Kode <strong className="font-mono text-base text-fg">{view.code}</strong>
          </span>
        )}
        {view.round !== null && view.phase !== "podium" && view.phase !== "ended" && (
          <span className="text-sm font-medium tabular-nums">
            Soal {view.round + 1}/{view.questionCount}
          </span>
        )}
        <span className="flex items-center gap-1.5 text-sm tabular-nums" title="Peserta">
          <Users className="size-4" aria-hidden /> {view.players}
        </span>
        <span
          className={connected ? "text-success" : "text-warning"}
          title={connected ? "Realtime tersambung" : "Realtime terputus, mencoba lagi…"}
        >
          {connected ? <Wifi className="size-4" /> : <WifiOff className="size-4" />}
          <span className="sr-only">{connected ? "Tersambung" : "Terputus"}</span>
        </span>
      </header>

      <main className="flex flex-1 flex-col p-6 sm:p-8">
        {view.paused && (
          <p className="mb-4 self-center rounded-full bg-warning-soft px-4 py-1.5 font-medium text-warning">
            Dijeda
          </p>
        )}
        {view.phase === "lobby" && (
          <LobbyStage view={view} joinUrl={joinUrl} online={online} onKick={setKick} />
        )}
        {view.phase === "countdown" && <CountdownStage view={view} offsetMs={offset} />}
        {view.phase === "open" && <QuestionStage view={view} offsetMs={offset} />}
        {view.phase === "reveal" && <RevealStage view={view} />}
        {view.phase === "leaderboard" && <LeaderboardStage key={view.round} top={view.top} />}
        {view.phase === "podium" && <PodiumStage top={view.top} />}
        {view.phase === "ended" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <h2 className="text-3xl font-bold">Sesi selesai</h2>
            <p className="text-fg-muted">Terima kasih sudah bermain!</p>
            {reportHref && (
              <Button asChild>
                <Link href={reportHref}>Lihat laporan</Link>
              </Button>
            )}
          </div>
        )}
      </main>

      {view.phase !== "ended" && (
        <footer className="flex flex-wrap items-center gap-3 border-t border-line bg-surface px-6 py-3">
          {view.phase === "lobby" ? (
            <>
              <Button
                variant="secondary"
                onClick={() => setMusic(!music)}
                aria-pressed={music}
                title="Musik latar"
              >
                {music ? <Music /> : <VolumeX />}
                <span className="hidden sm:inline">{music ? "Musik nyala" : "Musik mati"}</span>
              </Button>
              <Button
                variant="secondary"
                onClick={() => void settings({ lobbyLocked: !view.lobbyLocked })}
                aria-pressed={view.lobbyLocked}
              >
                {view.lobbyLocked ? <Lock /> : <LockOpen />}
                <span className="hidden sm:inline">
                  {view.lobbyLocked ? "Lobby dikunci" : "Kunci lobby"}
                </span>
              </Button>
            </>
          ) : (
            canPause && (
              <Button
                variant="secondary"
                onClick={() => void act(view.paused ? "resume" : "pause")}
              >
                {view.paused ? <Play /> : <Pause />}
                <span className="hidden sm:inline">{view.paused ? "Lanjutkan" : "Jeda"}</span>
              </Button>
            )
          )}
          <div className="flex items-center gap-2">
            <Switch
              id="auto-advance"
              checked={view.autoAdvance}
              onCheckedChange={(checked) => void settings({ autoAdvance: checked })}
            />
            <Label htmlFor="auto-advance" className="font-normal">
              Lanjut otomatis
            </Label>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="danger" onClick={() => setConfirmEnd(true)}>
              <Square /> <span className="hidden sm:inline">Akhiri</span>
            </Button>
            <Button
              size="lg"
              onClick={() => void act("next")}
              disabled={view.phase === "lobby" && view.roster.length === 0}
              aria-keyshortcuts="Space"
            >
              {next} <ChevronRight />
            </Button>
          </div>
        </footer>
      )}

      <Dialog open={kick !== null} onOpenChange={(open) => !open && setKick(null)}>
        {kick && (
          <DialogContent
            title={`Keluarkan ${kick.nickname}?`}
            description="Peserta ini tidak bisa menjawab lagi dan hilang dari papan skor."
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Batal</Button>
              </DialogClose>
              <Button variant="danger" onClick={() => void doKick(kick)}>
                Keluarkan
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={confirmEnd} onOpenChange={setConfirmEnd}>
        <DialogContent
          title="Akhiri sesi?"
          description={
            view.phase === "lobby" || view.phase === "podium"
              ? "Sesi ditutup dan kode tidak bisa dipakai lagi."
              : "Permainan berhenti dan langsung menampilkan podium dengan skor saat ini."
          }
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                setConfirmEnd(false);
                void act("end");
              }}
            >
              Akhiri
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
