"use client";

import { Check, Crown, Smartphone, Trophy, Users, X, Zap } from "lucide-react";
import { useMemo, type CSSProperties } from "react";
import { renderSVG } from "uqr";

import { AnswerShape, answerSlotClasses } from "@/components/player/AnswerShape";
import { ItemContent } from "@/components/player/ItemContent";
import { QuestionView } from "@/components/player/QuestionView";
import type { HostView, RosterEntry, Standing } from "@/engine/live/types";
import { msUntil } from "@/engine/transport/clock";
import { cn } from "@/lib/cn";
import { getDefinition } from "@/questions/registry";

import { Avatar } from "./Avatar";
import { choicesOf, isCorrectChoice } from "./choices";
import { CircleTimer } from "./CircleTimer";
import { Eliminated, RoyaleCounter } from "./RoyaleStages";
import { useNow } from "./hooks";

// The projector's big screens, one per phase (docs/09-mode-live.md, P5-10 – P5-13).

const spaced = (code: string | null) => (code ? `${code.slice(0, 3)} ${code.slice(3)}` : "");

export function LobbyStage({
  view,
  joinUrl,
  online,
  onKick,
}: {
  view: HostView;
  joinUrl: string;
  /** Presence keys currently connected. */
  online: ReadonlySet<string>;
  onKick: (entry: RosterEntry) => void;
}) {
  const qrUrl = `${joinUrl}?code=${view.code ?? ""}`;
  const qr = useMemo(() => renderSVG(qrUrl, { border: 1 }), [qrUrl]);
  const host = joinUrl.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-1 flex-col gap-8 lg:flex-row">
      <section className="flex flex-col items-center gap-5 rounded-3xl bg-surface p-8 text-center shadow-card lg:w-[28rem] lg:shrink-0">
        <p className="text-lg text-fg-muted">
          Buka <strong className="text-fg">{host}</strong> lalu masukkan kode
        </p>
        <p
          className="font-mono text-5xl font-bold tracking-wider whitespace-nowrap tabular-nums sm:text-6xl"
          aria-label={`Kode ${view.code ?? ""}`}
        >
          {spaced(view.code)}
        </p>
        <div
          className="size-48 overflow-hidden rounded-2xl border border-line bg-white p-1"
          role="img"
          aria-label={`Kode QR untuk ${qrUrl}`}
          // uqr renders a plain SVG string from our own URL — no user HTML involved.
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        {view.lobbyLocked && (
          <p className="rounded-full bg-warning-soft px-4 py-1.5 text-sm font-medium text-warning">
            Lobby dikunci: peserta baru tidak bisa masuk
          </p>
        )}
      </section>

      <section className="flex min-w-0 flex-1 flex-col gap-4" aria-label="Peserta">
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Users className="size-6" aria-hidden /> {view.roster.length} peserta
        </h2>
        {view.roster.length === 0 ? (
          <p className="flex flex-1 items-center justify-center rounded-3xl border-2 border-dashed border-line-strong p-10 text-xl text-fg-muted">
            Menunggu peserta bergabung…
          </p>
        ) : (
          <ul className="flex flex-wrap content-start gap-3">
            {view.roster.map((p) => (
              <li key={p.id} className="animate-pop">
                <button
                  type="button"
                  onClick={() => onKick(p)}
                  title="Klik untuk mengeluarkan"
                  className={cn(
                    "flex items-center gap-2 rounded-full bg-surface py-1.5 pr-4 pl-1.5 text-lg font-semibold shadow-card transition-colors hover:bg-danger-soft",
                    !online.has(p.id) && "opacity-50",
                  )}
                >
                  <Avatar id={p.id} />
                  <span className="max-w-48 truncate">{p.nickname}</span>
                  <span className="sr-only">{online.has(p.id) ? "(online)" : "(offline)"}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function CountdownStage({ view, offsetMs }: { view: HostView; offsetMs: number }) {
  const now = useNow(100, !view.paused);
  const left = view.paused
    ? (view.pausedRemainingMs ?? 0)
    : (msUntil(view.phaseClosesAt, offsetMs, now) ?? 0);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      <p className="text-2xl font-medium text-fg-muted">
        Soal {(view.round ?? 0) + 1} dari {view.questionCount}
      </p>
      {view.question && (
        <h2 className="max-w-5xl text-4xl leading-tight font-bold text-balance sm:text-5xl">
          {view.question.prompt}
        </h2>
      )}
      <span
        key={Math.ceil(left / 1000)}
        className="flex size-32 animate-pop items-center justify-center rounded-full bg-accent text-6xl font-bold text-on-accent tabular-nums"
        aria-live="polite"
      >
        {Math.max(1, Math.ceil(left / 1000))}
      </span>
    </div>
  );
}

function ChoiceGrid({
  view,
  reveal,
}: {
  view: HostView;
  /** Reveal: correct choices stand out, with how many picked each. */
  reveal?: { config: unknown; counts?: Record<string, number> };
}) {
  const q = view.question!;
  const choices = choicesOf(q)!;
  const total = reveal?.counts ? Object.values(reveal.counts).reduce((a, b) => a + b, 0) : 0;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {choices.map((c) => {
        const correct = reveal ? isCorrectChoice(q, reveal.config, c.key) : false;
        const count = reveal?.counts?.[c.key] ?? 0;
        return (
          <li
            key={c.key}
            className={cn(
              "relative flex min-h-24 items-center gap-4 overflow-hidden rounded-2xl px-5 py-4 text-2xl font-semibold shadow-card",
              answerSlotClasses(c.slot),
              reveal && !correct && "opacity-40",
            )}
          >
            <AnswerShape slot={c.slot} className="size-10 shrink-0 bg-transparent" />
            <ItemContent item={c.item} fallback={c.item.text || "Opsi"} imageClassName="size-20" />
            {reveal && (
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {correct ? (
                  <Check className="size-8" strokeWidth={3} aria-label="benar" />
                ) : (
                  <X className="size-7" aria-label="salah" />
                )}
                <span className="text-3xl">{count}</span>
              </span>
            )}
            {reveal && total > 0 && (
              <span
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-1.5 bg-current opacity-60"
                style={{ width: `${(count / total) * 100}%` }}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Prompt({ view }: { view: HostView }) {
  const q = view.question!;
  return (
    <div className="flex flex-col items-center gap-4 text-center">
      <h2 className="max-w-5xl text-3xl leading-tight font-bold text-balance sm:text-5xl">
        {q.prompt || "Soal tanpa pertanyaan"}
      </h2>
      {q.media.map((m) =>
        m.kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
          <img
            key={m.url}
            src={m.url}
            alt={m.alt ?? ""}
            className="max-h-[32vh] rounded-2xl object-contain shadow-card"
          />
        ) : null,
      )}
    </div>
  );
}

export function QuestionStage({ view, offsetMs }: { view: HostView; offsetMs: number }) {
  const q = view.question;
  if (!q) return null;
  const choices = choicesOf(q);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-start justify-between gap-6">
        <CircleTimer
          closesAt={view.phaseClosesAt}
          totalMs={view.timeLimitMs ?? 20_000}
          offsetMs={offsetMs}
          paused={view.paused}
          pausedRemainingMs={view.pausedRemainingMs}
          alarm={!!view.royale && (view.royale.shrinking || view.royale.suddenDeath)}
        />
        <div className="flex min-w-0 flex-1 flex-col items-center gap-4">
          {view.royale && <RoyaleCounter view={view} />}
          <Prompt view={view} />
        </div>
        <div
          className="flex size-28 shrink-0 flex-col items-center justify-center rounded-full bg-surface shadow-card"
          aria-live="polite"
        >
          <span className="text-4xl font-bold tabular-nums">{view.answered}</span>
          <span className="text-xs text-fg-muted">dari {view.players} menjawab</span>
        </div>
      </div>
      <div className="mt-auto">
        {choices ? (
          <ChoiceGrid view={view} />
        ) : (
          <p className="flex items-center justify-center gap-3 rounded-2xl bg-surface p-8 text-2xl text-fg-muted shadow-card">
            <Smartphone className="size-8" aria-hidden />
            {getDefinition(q.type).label}: jawab di HP masing-masing
          </p>
        )}
      </div>
    </div>
  );
}

export function RevealStage({ view }: { view: HostView }) {
  const q = view.question;
  const reveal = view.reveal;
  if (!q || !reveal) return null;
  const choices = choicesOf(q);
  return (
    <div className="flex flex-1 flex-col gap-6">
      {view.mode === "battle_buzzer" && <WinnerBanner view={view} />}
      {view.royale && <Eliminated view={view} />}
      <Prompt view={view} />
      {choices ? (
        <ChoiceGrid view={view} reveal={reveal} />
      ) : (
        <div className="mx-auto w-full max-w-3xl rounded-2xl bg-surface p-6 shadow-card">
          <QuestionView
            type={q.type}
            prompt=""
            data={q.data}
            answer={null}
            reveal={reveal.config}
            disabled
            size="sm"
          />
        </div>
      )}
      <div className="flex flex-wrap items-center justify-center gap-6 text-2xl font-semibold">
        <span className="flex items-center gap-2 text-success">
          <Check className="size-7" strokeWidth={3} aria-hidden /> {reveal.correct ?? 0} benar
        </span>
        <span className="flex items-center gap-2 text-danger">
          <X className="size-7" strokeWidth={3} aria-hidden /> {reveal.wrong ?? 0} kurang tepat
        </span>
        <span className="text-fg-muted">
          {Math.max(0, view.players - (reveal.correct ?? 0) - (reveal.wrong ?? 0))} tidak menjawab
        </span>
      </div>
      {reveal.explanation && (
        <p className="mx-auto max-w-4xl rounded-2xl bg-accent-soft px-6 py-4 text-center text-xl">
          {reveal.explanation}
        </p>
      )}
    </div>
  );
}

/** Rebutan: who got it first (P6-07). */
function WinnerBanner({ view }: { view: HostView }) {
  if (!view.winner) {
    return (
      <p className="self-center rounded-full bg-surface-muted px-6 py-2 text-2xl font-semibold text-fg-muted">
        Tidak ada yang menjawab benar
      </p>
    );
  }
  return (
    <p
      className="flex animate-pop items-center justify-center gap-3 self-center rounded-3xl bg-warning-soft px-8 py-4 text-4xl font-bold text-warning"
      role="status"
    >
      <Zap className="size-10" aria-hidden /> <Avatar id={view.winner.id} className="size-12" />
      {view.winner.nickname} tercepat!
    </p>
  );
}

const ROW_REM = 5; // row height + gap, for the slide-in offset

export function LeaderboardStage({ top, showWins }: { top: Standing[]; showWins?: boolean }) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6">
      <h2 className="text-center text-4xl font-bold">Papan skor</h2>
      {top.length === 0 ? (
        <p className="text-center text-xl text-fg-muted">Belum ada peserta.</p>
      ) : (
        <ol className="flex flex-col gap-4">
          {top.map((row, i) => {
            // Slide from the previous place (rows from outside the top 5 come from below).
            const from = Math.min(row.prevRank - 1, 6) - i;
            return (
              <li
                key={row.id}
                style={{ "--rank-from": `${from * ROW_REM}rem` } as CSSProperties}
                className={cn(
                  "flex h-16 animate-rank-move items-center gap-4 rounded-2xl bg-surface px-5 shadow-card",
                  i === 0 && "ring-2 ring-warning",
                )}
              >
                <span className="w-8 text-2xl font-bold tabular-nums">{row.rank}</span>
                <Avatar id={row.id} />
                <span className="min-w-0 flex-1 truncate text-2xl font-semibold">
                  {row.nickname}
                </span>
                {row.delta > 0 && (
                  <span className="text-lg font-semibold text-success tabular-nums">
                    +{row.delta}
                  </span>
                )}
                {showWins && (
                  <span
                    className="flex items-center gap-1 text-lg font-semibold text-warning tabular-nums"
                    title="Soal dimenangkan"
                  >
                    <Trophy className="size-5" aria-hidden /> {row.wins ?? 0}
                    <span className="sr-only">soal dimenangkan</span>
                  </span>
                )}
                <span className="w-24 text-right text-2xl font-bold tabular-nums">{row.score}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const PODIUM = [
  { place: 2, height: "h-40", delay: "300ms" },
  { place: 1, height: "h-56", delay: "700ms" },
  { place: 3, height: "h-28", delay: "0ms" },
];

export function PodiumStage({ top }: { top: Standing[] }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-end gap-8">
      <h2 className="text-4xl font-bold">Juara</h2>
      <ol className="flex w-full max-w-4xl items-end justify-center gap-4">
        {PODIUM.map(({ place, height, delay }) => {
          const row = top.find((t) => t.rank === place) ?? top[place - 1];
          return (
            <li
              key={place}
              className="flex flex-1 animate-podium flex-col items-center gap-3"
              style={{ animationDelay: delay }}
            >
              {row ? (
                <>
                  {place === 1 && <Crown className="size-10 text-warning" aria-hidden />}
                  <Avatar id={row.id} className="size-16 text-3xl" />
                  <span className="max-w-full truncate text-2xl font-bold">{row.nickname}</span>
                  <span className="text-lg text-fg-muted tabular-nums">{row.score} poin</span>
                </>
              ) : (
                <span className="text-fg-subtle">–</span>
              )}
              <div
                className={cn(
                  "flex w-full items-start justify-center rounded-t-2xl pt-3 text-5xl font-bold",
                  height,
                  place === 1 ? "bg-warning-soft text-warning" : "bg-surface shadow-card",
                )}
                aria-label={`Peringkat ${place}`}
              >
                {place}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
