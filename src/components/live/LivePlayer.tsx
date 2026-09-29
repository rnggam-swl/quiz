"use client";

import { Eye, EyeOff, Flame, LoaderCircle, Lock, Trophy, Zap } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { AnswerShape, answerSlotClasses } from "@/components/player/AnswerShape";
import { Button3D } from "@/components/player/Button3D";
import { ItemContent } from "@/components/player/ItemContent";
import { QuestionView, answersOnTap } from "@/components/player/QuestionView";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { openSignedState, PERSONAL_PHASES, withYou } from "@/engine/live/signed";
import type { BattleOutcome, GameMode, LivePlayerAdapter, PlayerView } from "@/engine/live/types";
import { NICKNAME_MAX } from "@/engine/practice/nickname";
import type { PlayError, PlayQuestion } from "@/engine/practice/types";
import { msUntil } from "@/engine/transport/clock";
import type { LivePublicKey } from "@/engine/transport/signing";
import type { ChannelFactory, LiveEvent } from "@/engine/transport/types";
import { cn } from "@/lib/cn";
import { playSound } from "@/lib/sound";

import { Avatar } from "./Avatar";
import { answerFor, choicesOf, isCorrectChoice, isMultiSelect, keysOf } from "./choices";
import { useChannel, useLiveState, useNow, useServerOffset } from "./hooks";

const JOIN_ERRORS: Partial<Record<PlayError, string>> = {
  invalid: "Pakai nama panggilan yang lain, ya.",
  lobby_locked: "Host sudah mengunci lobby.",
  late_join_closed: "Permainan sudah dimulai; peserta baru tidak bisa masuk.",
  session_closed: "Sesi ini sudah selesai.",
  not_found: "Sesi tidak ditemukan.",
  network: "Koneksi bermasalah. Coba lagi.",
};

const SHOW_QUESTION_KEY = "quiz:live:show-question";
const PERSONAL_SPREAD_MS = 1000;

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked: the game works, a reload just asks for the name again.
  }
}

/**
 * The participant's phone in a live session (P5-15 – P5-17): join, wait in the lobby,
 * answer with big coloured buttons, then see how it went. The token in localStorage
 * brings a participant back to the right phase after a reload or a dropped connection.
 */
export function LivePlayer({
  sessionId,
  title,
  adapter,
  openChannel,
  storageKey,
  publicKey,
  mode = "live",
  measureClock = true,
}: {
  sessionId: string;
  title: string;
  /** For the badge on the join form. */
  mode?: GameMode;
  adapter: LivePlayerAdapter;
  openChannel: ChannelFactory;
  /** localStorage key for the participant token (null = don't persist). */
  storageKey: string | null;
  /** Checks the server's signed broadcasts; without it every event means a fetch. */
  publicKey: LivePublicKey | null;
  measureClock?: boolean;
}) {
  // undefined = not read yet (storage only exists in the browser).
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    const timer = setTimeout(() => setToken(storageKey ? readStorage(storageKey) : null), 0);
    return () => clearTimeout(timer);
  }, [storageKey]);

  const forget = useCallback(() => {
    if (storageKey) writeStorage(storageKey, null);
    setToken(null);
  }, [storageKey]);

  if (token === undefined) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-fg-muted" role="status">
        <LoaderCircle className="size-6 animate-spin" aria-hidden />
        <span className="sr-only">Memuat…</span>
      </main>
    );
  }
  if (!token) {
    return (
      <JoinForm
        title={title}
        mode={mode}
        adapter={adapter}
        onJoined={(t) => {
          if (storageKey) writeStorage(storageKey, t);
          setToken(t);
        }}
      />
    );
  }
  return (
    <Game
      key={token}
      sessionId={sessionId}
      token={token}
      adapter={adapter}
      openChannel={openChannel}
      publicKey={publicKey}
      measureClock={measureClock}
      onForget={forget}
    />
  );
}

function JoinForm({
  title,
  mode,
  adapter,
  onJoined,
}: {
  title: string;
  mode: GameMode;
  adapter: LivePlayerAdapter;
  onJoined: (token: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const result = await adapter.join(nickname).catch(() => null);
    setBusy(false);
    if (result?.ok) onJoined(result.token);
    else setError(JOIN_ERRORS[result?.error ?? "network"] ?? JOIN_ERRORS.network!);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-4 py-10">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent-fg uppercase">
          {mode === "battle_buzzer" ? "Rebutan" : "Live"}
        </span>
        <h1 className="text-2xl font-semibold text-balance">{title}</h1>
      </div>
      <form
        onSubmit={submit}
        className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="live-nickname">Nama panggilan</Label>
          <Input
            id="live-nickname"
            value={nickname}
            maxLength={NICKNAME_MAX}
            autoComplete="nickname"
            autoFocus
            onChange={(e) => setNickname(e.target.value)}
            required
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" disabled={busy || !nickname.trim()}>
          {busy && <LoaderCircle className="animate-spin" />} Gabung
        </Button>
      </form>
    </main>
  );
}

function Game({
  sessionId,
  token,
  adapter,
  openChannel,
  publicKey,
  measureClock,
  onForget,
}: {
  sessionId: string;
  token: string;
  adapter: LivePlayerAdapter;
  openChannel: ChannelFactory;
  publicKey: LivePublicKey | null;
  measureClock: boolean;
  onForget: () => void;
}) {
  const channel = useChannel(openChannel, sessionId);
  const offset = useServerOffset(measureClock);
  const fetchState = useCallback(() => adapter.state(token), [adapter, token]);
  const onError = useCallback(
    (error: PlayError) => {
      if (error === "unauthorized" || error === "not_found") onForget();
    },
    [onForget],
  );
  // A verified broadcast carries the new state: no need to ask the server for it.
  const fromEvent = useCallback(
    async (event: LiveEvent, current: PlayerView | null) => {
      if (!publicKey || !current) return null;
      const state = await openSignedState(event, publicKey, sessionId);
      return state ? withYou(current, state.view, state.kicked) : null;
    },
    [publicKey, sessionId],
  );
  const { view, refresh, connected } = useLiveState<PlayerView>({
    fetchState,
    channel,
    // Events do the work while connected; the slow poll only catches lost ones.
    pollMs: (_, isConnected) => (isConnected ? 20_000 : 3000),
    onError,
    fromEvent,
  });

  // Points, score and rank change at the reveal (and the end): fetch them then, spread
  // over a second so the whole room doesn't ask at once.
  const needsYou = !!view?.partial && PERSONAL_PHASES.has(view.phase);
  const version = view?.version;
  useEffect(() => {
    if (!needsYou) return;
    const timer = setTimeout(() => void refresh(), Math.random() * PERSONAL_SPREAD_MS);
    return () => clearTimeout(timer);
  }, [needsYou, version, refresh]);

  const you = view?.you;
  useEffect(() => {
    if (!channel || !you) return;
    channel.track({ key: you.id, nickname: you.nickname, role: "player" });
  }, [channel, you?.id, you?.nickname]); // eslint-disable-line react-hooks/exhaustive-deps

  const [showQuestion, setShowQuestion] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setShowQuestion(readStorage(SHOW_QUESTION_KEY) !== "0"), 0);
    return () => clearTimeout(timer);
  }, []);

  // What this phone just sent, until the server confirms it (optimistic).
  const [sent, setSent] = useState<{ questionId: string; answer: unknown } | null>(null);
  // Rebutan: the verdict on this phone's answer (it comes back at once).
  const [battle, setBattle] = useState<{
    questionId: string;
    outcome?: BattleOutcome;
    beaten?: boolean;
  } | null>(null);

  // Sounds at the reveal.
  const revealKey = view?.phase === "reveal" ? view.version : null;
  const lastSound = useRef<number | null>(null);
  const winnerId = view?.winner?.id ?? null;
  const isBuzzer = view?.mode === "battle_buzzer";
  useEffect(() => {
    if (revealKey === null || lastSound.current === revealKey || !you) return;
    lastSound.current = revealKey;
    if (isBuzzer) {
      // The winner heard it when they answered; everyone else feels it (P6-10).
      if (winnerId && winnerId !== you.id) vibrate();
      return;
    }
    if (!you.result) return;
    playSound(you.result.ratio >= 1 ? "correct" : you.result.ratio > 0 ? "partial" : "wrong");
  }, [revealKey, you, isBuzzer, winnerId]);

  // Podium: confetti for the top 3.
  const podium = view?.phase === "podium";
  const rank = you?.rank ?? 99;
  useEffect(() => {
    if (!podium || rank > 3) return;
    playSound("fanfare");
    void import("canvas-confetti").then(({ default: confetti }) =>
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        disableForReducedMotion: true,
      }),
    );
  }, [podium, rank]);

  async function submit(q: PlayQuestion, answer: unknown) {
    setSent({ questionId: q.id, answer });
    playSound("tap");
    const result = await adapter.answer(token, q.id, answer).catch(() => null);
    const buzzer = view?.mode === "battle_buzzer";
    if (result?.ok && buzzer && result.outcome) {
      setBattle({ questionId: q.id, outcome: result.outcome });
      if (result.outcome.won) playSound("correct");
      else {
        playSound("wrong");
        vibrate();
      }
    } else if (!result?.ok && buzzer && result?.error === "round_closed") {
      // Someone was faster; the reveal with their name is on its way.
      setBattle({ questionId: q.id, beaten: true });
      vibrate();
    } else if (!result?.ok && result?.error !== "already_answered") {
      setSent(null);
      toast.error(
        result?.error === "round_closed" || result?.error === "deadline_passed"
          ? "Waktu habis, jawaban tidak terkirim."
          : "Jawaban gagal terkirim. Coba lagi.",
      );
    }
    void refresh();
  }

  if (!view || !you) {
    return (
      <main className="flex min-h-dvh items-center justify-center text-fg-muted" role="status">
        <LoaderCircle className="size-6 animate-spin" aria-hidden />
        <span className="sr-only">Menyambung…</span>
      </main>
    );
  }

  const q = view.question;
  const answeredNow = you.answered || (!!q && sent?.questionId === q.id);
  const myAnswer = you.answered ? you.answer : sent?.questionId === q?.id ? sent?.answer : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-4 py-2">
        <Avatar id={you.id} className="size-8 text-base" />
        <span className="min-w-0 flex-1 truncate font-semibold">{you.nickname}</span>
        <span className="font-semibold tabular-nums">{you.score} poin</span>
        {!connected && (
          <span className="text-xs text-warning" role="status">
            Menyambung ulang…
          </span>
        )}
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4">
        {you.kicked ? (
          <Center>
            <p className="text-lg">Kamu dikeluarkan dari sesi ini oleh host.</p>
            <Button asChild variant="secondary">
              <Link href="/join">Masukkan kode lain</Link>
            </Button>
          </Center>
        ) : view.phase === "lobby" ? (
          <Center>
            <Avatar id={you.id} className="size-24 text-5xl" />
            <p className="text-2xl font-bold">Kamu masuk!</p>
            <p className="text-fg-muted">Lihat layar depan. Menunggu host memulai…</p>
          </Center>
        ) : view.phase === "countdown" ? (
          <Countdown view={view} offset={offset} />
        ) : view.phase === "open" && q ? (
          you.spectator ? (
            <Center>
              <p className="text-lg">Kamu bergabung saat permainan berjalan, jadi kamu menonton.</p>
            </Center>
          ) : view.mode === "battle_buzzer" && (answeredNow || battle?.questionId === q.id) ? (
            <BuzzerWait
              you={you}
              battle={battle?.questionId === q.id ? battle : null}
              sentAnswer={<SentAnswer q={q} answer={myAnswer} />}
            />
          ) : answeredNow ? (
            <Center>
              <SentAnswer q={q} answer={myAnswer} />
              <p className="text-xl font-semibold">Jawaban terkirim</p>
              <p className="text-fg-muted">Menunggu yang lain…</p>
            </Center>
          ) : (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-fg-muted">
                  Soal {(view.round ?? 0) + 1}/{view.questionCount}
                </span>
                <TimeLeft view={view} offset={offset} />
                <button
                  type="button"
                  onClick={() => {
                    writeStorage(SHOW_QUESTION_KEY, showQuestion ? "0" : "1");
                    setShowQuestion(!showQuestion);
                  }}
                  className="inline-flex items-center gap-1 text-sm text-fg-muted underline-offset-2 hover:underline"
                  aria-pressed={showQuestion}
                >
                  {showQuestion ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  {showQuestion ? "Sembunyikan soal" : "Tampilkan soal"}
                </button>
              </div>
              <Controller
                key={q.id}
                q={q}
                showQuestion={showQuestion}
                onSubmit={(a) => void submit(q, a)}
              />
            </>
          )
        ) : view.phase === "reveal" ? (
          view.mode === "battle_buzzer" ? (
            <BuzzerReveal view={view} />
          ) : (
            <RevealCard view={view} />
          )
        ) : view.phase === "leaderboard" ? (
          <Center>
            <Trophy className="size-12 text-warning" aria-hidden />
            <p className="text-lg text-fg-muted">Peringkatmu</p>
            <p className="text-6xl font-bold tabular-nums">#{you.rank ?? "…"}</p>
            <p className="text-xl font-semibold tabular-nums">{you.score} poin</p>
          </Center>
        ) : view.phase === "podium" || view.phase === "ended" ? (
          <Center>
            <p className="text-lg text-fg-muted">Peringkat akhir</p>
            <p className="text-6xl font-bold tabular-nums">#{you.rank ?? "…"}</p>
            <p className="text-xl font-semibold tabular-nums">{you.score} poin</p>
            {you.rank !== null && you.rank <= 3 && (
              <p className="text-2xl">{["🥇", "🥈", "🥉"][you.rank - 1]}</p>
            )}
            {view.phase === "ended" && (
              <Button asChild variant="secondary">
                <Link href="/join">Main quiz lain</Link>
              </Button>
            )}
          </Center>
        ) : null}
      </main>
    </div>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 animate-fade-up flex-col items-center justify-center gap-3 text-center">
      {children}
    </div>
  );
}

function Countdown({ view, offset }: { view: PlayerView; offset: number }) {
  const now = useNow(100, !view.paused);
  const left = view.paused
    ? (view.pausedRemainingMs ?? 0)
    : (msUntil(view.phaseClosesAt, offset, now) ?? 0);
  return (
    <Center>
      <p className="text-lg text-fg-muted">
        Soal {(view.round ?? 0) + 1} dari {view.questionCount}
      </p>
      <p className="text-2xl font-semibold">Bersiap…</p>
      <span
        key={Math.ceil(left / 1000)}
        className="flex size-24 animate-pop items-center justify-center rounded-full bg-accent text-5xl font-bold text-on-accent tabular-nums"
      >
        {Math.max(1, Math.ceil(left / 1000))}
      </span>
    </Center>
  );
}

function TimeLeft({ view, offset }: { view: PlayerView; offset: number }) {
  const now = useNow(250, !view.paused);
  const left = view.paused
    ? (view.pausedRemainingMs ?? 0)
    : (msUntil(view.phaseClosesAt, offset, now) ?? 0);
  const seconds = Math.ceil(left / 1000);
  return (
    <span
      role="timer"
      className={cn(
        "rounded-full px-3 py-1 text-sm font-bold tabular-nums",
        seconds <= 5 ? "bg-danger-soft text-danger" : "bg-surface-muted",
      )}
    >
      {view.paused ? "Dijeda" : `${seconds} dtk`}
    </span>
  );
}

/** Big coloured buttons (P5-16) for choice types; the full player for the others. */
function Controller({
  q,
  showQuestion,
  onSubmit,
}: {
  q: PlayQuestion;
  showQuestion: boolean;
  onSubmit: (answer: unknown) => void;
}) {
  const choices = choicesOf(q);
  const multi = isMultiSelect(q);
  const [picked, setPicked] = useState<string[]>([]);
  const [draft, setDraft] = useState<unknown>(null);

  if (!choices) {
    return (
      <div className="flex flex-1 flex-col gap-4">
        <QuestionView
          type={q.type}
          prompt={q.prompt}
          help={q.help}
          media={q.media}
          data={q.data}
          answer={draft}
          onAnswer={setDraft}
          onCommit={(a) => onSubmit(a)}
          size="sm"
        />
        {!answersOnTap(q.type, q.data) && (
          <Button size="lg" disabled={draft === null} onClick={() => onSubmit(draft)}>
            Kirim jawaban
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      {showQuestion && <h2 className="text-xl font-semibold text-balance">{q.prompt}</h2>}
      {multi && <p className="text-sm text-fg-muted">Pilih semua yang benar, lalu kirim.</p>}
      <div
        className={cn("grid flex-1 gap-3", choices.length > 2 ? "grid-cols-2" : "grid-cols-1")}
        role="group"
        aria-label="Pilihan jawaban"
      >
        {choices.map((c) => {
          const on = picked.includes(c.key);
          return (
            <Button3D
              key={c.key}
              block
              color={`var(--answer-${c.slot})`}
              textColor={`var(--on-answer-${c.slot})`}
              pressed={multi ? on : undefined}
              onClick={() => {
                if (!multi) return onSubmit(answerFor(q, [c.key]));
                setPicked(on ? picked.filter((k) => k !== c.key) : [...picked, c.key]);
              }}
              className={cn(
                "min-h-28 flex-col rounded-3xl px-3 py-4 text-lg",
                multi && on && "ring-4 ring-fg/80 ring-offset-2 ring-offset-canvas",
              )}
            >
              <AnswerShape slot={c.slot} className="size-12 bg-transparent" />
              {showQuestion ? (
                <ItemContent item={c.item} fallback={c.item.text || "Opsi"} />
              ) : (
                <span className="sr-only">{c.item.text}</span>
              )}
            </Button3D>
          );
        })}
      </div>
      {multi && (
        <Button
          size="lg"
          disabled={picked.length === 0}
          onClick={() => onSubmit(answerFor(q, picked))}
        >
          Kirim jawaban
        </Button>
      )}
    </div>
  );
}

function SentAnswer({ q, answer }: { q: PlayQuestion; answer: unknown }) {
  const choices = choicesOf(q);
  const keys = keysOf(q, answer);
  const mine = choices?.filter((c) => keys.includes(c.key)) ?? [];
  if (mine.length === 0)
    return <LoaderCircle className="size-10 animate-spin text-fg-muted" aria-hidden />;
  return (
    <div className="flex gap-2">
      {mine.map((c) => (
        <span
          key={c.key}
          className={cn(
            "flex size-20 items-center justify-center rounded-2xl p-4",
            answerSlotClasses(c.slot),
          )}
        >
          <AnswerShape slot={c.slot} className="size-full bg-transparent" />
        </span>
      ))}
    </div>
  );
}

function vibrate() {
  try {
    navigator.vibrate?.(180);
  } catch {
    // Not supported (desktop, iOS): the screen says it anyway.
  }
}

/** Rebutan, after answering while the round is still open (P6-09 – P6-11). */
function BuzzerWait({
  you,
  battle,
  sentAnswer,
}: {
  you: PlayerView["you"];
  battle: { outcome?: BattleOutcome; beaten?: boolean } | null;
  sentAnswer: React.ReactNode;
}) {
  const outcome = battle?.outcome;
  const wrong = outcome ? !outcome.correct : !!you.result && you.result.ratio < 1;
  if (outcome?.won) {
    return (
      <Center>
        <Zap className="size-16 animate-pop text-warning" aria-hidden />
        <p className="text-3xl font-bold">Kamu tercepat!</p>
        <p className="text-xl font-semibold tabular-nums">+{outcome.points} poin</p>
      </Center>
    );
  }
  if (battle?.beaten) {
    return (
      <Center>
        <Zap className="size-12 text-fg-muted" aria-hidden />
        <p className="text-2xl font-bold">Keduluan!</p>
        <p className="text-fg-muted">Ada yang menjawab benar lebih dulu.</p>
      </Center>
    );
  }
  if (wrong) {
    const penalty = outcome && outcome.points < 0 ? -outcome.points : 0;
    return (
      <Center>
        <div className="flex w-full animate-shake flex-col items-center gap-2 rounded-3xl bg-danger-soft p-8 text-danger">
          <Lock className="size-12" aria-hidden />
          <p className="text-2xl font-bold">Salah!</p>
          <p className="font-medium">Coba di soal berikutnya</p>
          {penalty > 0 && <p className="text-sm tabular-nums">−{penalty} poin</p>}
        </div>
      </Center>
    );
  }
  return (
    <Center>
      {sentAnswer}
      <p className="text-xl font-semibold">Jawaban terkirim</p>
    </Center>
  );
}

/** The right answer, shown on the phone at a Rebutan reveal (P6-10). */
function CorrectAnswer({ view }: { view: PlayerView }) {
  const q = view.question;
  const config = view.reveal?.config;
  if (!q || config === undefined) return null;
  const choices = choicesOf(q);
  if (choices) {
    const right = choices.filter((c) => isCorrectChoice(q, config, c.key));
    return (
      <div className="flex w-full flex-col gap-2">
        <p className="text-sm text-fg-muted">Jawaban benar</p>
        {right.map((c) => (
          <span
            key={c.key}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-lg font-semibold",
              answerSlotClasses(c.slot),
            )}
          >
            <AnswerShape slot={c.slot} className="size-8 bg-transparent" />
            <ItemContent item={c.item} fallback={c.item.text || "Opsi"} />
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="w-full rounded-2xl bg-surface p-4 text-left shadow-card">
      <QuestionView
        type={q.type}
        prompt={q.prompt}
        data={q.data}
        answer={view.you.answer}
        reveal={config}
        disabled
        size="sm"
      />
    </div>
  );
}

function BuzzerReveal({ view }: { view: PlayerView }) {
  const { you, winner } = view;
  const mine = winner?.id === you.id;
  const wrong = !!you.result && you.result.ratio < 1;
  const points = you.result?.points ?? null;
  return (
    <Center>
      {mine ? (
        <div className="flex w-full animate-pop flex-col items-center gap-2 rounded-3xl bg-warning-soft p-8 text-warning">
          <Zap className="size-12" aria-hidden />
          <p className="text-3xl font-bold">Kamu tercepat!</p>
          <p className="text-xl font-semibold tabular-nums">
            {points === null ? "Menghitung poin…" : `+${points} poin`}
          </p>
        </div>
      ) : (
        <div className="flex w-full flex-col items-center gap-2 rounded-3xl bg-surface-muted p-6">
          <p className="text-2xl font-bold">
            {winner ? `Keduluan ${winner.nickname}!` : "Tidak ada yang benar"}
          </p>
          {wrong && (
            <p className="text-danger">
              Jawabanmu salah{points !== null && points < 0 ? ` (−${-points} poin)` : ""}
            </p>
          )}
        </div>
      )}
      <CorrectAnswer view={view} />
      <p className="text-fg-muted">
        Peringkat <strong className="text-fg tabular-nums">#{you.rank ?? "…"}</strong> · {you.score}{" "}
        poin
      </p>
    </Center>
  );
}

function RevealCard({ view }: { view: PlayerView }) {
  const { you } = view;
  const result = you.result;
  const tone = !result
    ? { title: "Waktu habis", emoji: "⏰", className: "bg-surface-muted" }
    : result.ratio >= 1
      ? { title: "Benar!", emoji: "🎉", className: "bg-success-soft text-success" }
      : result.ratio > 0
        ? { title: "Hampir!", emoji: "💪", className: "bg-warning-soft text-warning" }
        : { title: "Belum tepat", emoji: "🌱", className: "bg-danger-soft text-danger" };
  return (
    <Center>
      <div
        className={cn("flex w-full flex-col items-center gap-2 rounded-3xl p-8", tone.className)}
      >
        <span className="text-5xl" aria-hidden>
          {tone.emoji}
        </span>
        <p className="text-3xl font-bold">{tone.title}</p>
        {result && (
          <p className="text-xl font-semibold tabular-nums">
            {result.points === null ? "Menghitung poin…" : `+${result.points} poin`}
          </p>
        )}
      </div>
      {(you.streak ?? 0) >= 2 && (
        <p className="flex items-center gap-1 font-semibold text-warning">
          <Flame className="size-5" aria-hidden /> {you.streak} benar beruntun
        </p>
      )}
      <p className="text-fg-muted">
        Peringkat <strong className="text-fg tabular-nums">#{you.rank ?? "…"}</strong> · {you.score}{" "}
        poin
      </p>
    </Center>
  );
}
