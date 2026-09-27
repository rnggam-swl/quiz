"use client";

import {
  Check,
  ChevronDown,
  Flame,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { useState } from "react";

import { Button3D } from "@/components/player/Button3D";
import { QuestionView } from "@/components/player/QuestionView";
import { scoreBand, type Progress } from "@/engine/practice/gamification";
import { NICKNAME_MAX } from "@/engine/practice/nickname";
import type { AnswerOutcome, AttemptSummary, PlayInfo } from "@/engine/practice/types";
import { cn } from "@/lib/cn";
import { formatResult } from "@/lib/format";
import { isMuted, setMuted } from "@/lib/sound";

export function NicknameForm({
  info,
  busy,
  error,
  onSubmit,
}: {
  info: PlayInfo;
  busy: boolean;
  error?: string;
  onSubmit: (nickname: string) => void;
}) {
  const [nickname, setNickname] = useState("");
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-10">
      {info.coverUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
        <img
          src={info.coverUrl}
          alt=""
          className="aspect-video w-full rounded-2xl object-cover shadow-card"
        />
      )}
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold text-balance">{info.title || "Quiz"}</h1>
        {info.description && <p className="text-fg-muted">{info.description}</p>}
        <p className="text-sm text-fg-subtle">{info.questionCount} soal</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (nickname.trim()) onSubmit(nickname);
        }}
      >
        <label htmlFor="nickname" className="text-sm font-medium">
          Nama panggilan
        </label>
        <input
          id="nickname"
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX}
          autoComplete="nickname"
          autoFocus
          placeholder="mis. Budi"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "nickname-error" : undefined}
          className="h-14 rounded-2xl border-2 border-line bg-surface px-5 text-lg font-semibold shadow-card outline-none focus-visible:border-theme"
        />
        {error && (
          <p id="nickname-error" role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button3D type="submit" size="xl" block disabled={busy || !nickname.trim()}>
          {busy && <LoaderCircle className="size-5 animate-spin" />}
          Mulai
        </Button3D>
      </form>
    </main>
  );
}

/** Only rendered after the player has loaded (client-side), so reading localStorage here is safe. */
export function MuteButton() {
  const [muted, setMutedState] = useState(isMuted);
  return (
    <button
      type="button"
      onClick={() => {
        setMuted(!muted);
        setMutedState(!muted);
      }}
      aria-pressed={muted}
      aria-label={muted ? "Nyalakan suara" : "Matikan suara"}
      className="inline-flex size-9 items-center justify-center rounded-full bg-surface text-fg-muted shadow-card hover:text-fg"
    >
      {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}

export function Hud({
  index,
  total,
  answeredCount,
  progress,
  gamification,
}: {
  index: number;
  total: number;
  answeredCount: number;
  progress: Progress;
  gamification: boolean;
}) {
  return (
    <header className="sticky top-0 z-10 bg-theme-bg/90 backdrop-blur">
      <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <div
          className="h-2.5 flex-1 overflow-hidden rounded-full bg-black/10"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={answeredCount}
          aria-label="Soal terjawab"
        >
          <div
            className="h-full rounded-full bg-theme transition-[width] duration-300"
            style={{ width: `${total ? (answeredCount / total) * 100 : 0}%` }}
          />
        </div>
        <span className="text-sm font-semibold text-fg-muted tabular-nums">
          {Math.min(index + 1, total)}/{total}
        </span>
        {gamification && (
          <>
            <span
              className="inline-flex items-center gap-1 rounded-full bg-surface px-3 py-1 text-sm font-bold tabular-nums shadow-card"
              aria-label={`${progress.xp} XP`}
            >
              <Sparkles className="size-4 text-warning" aria-hidden /> {progress.xp}
            </span>
            {progress.streak >= 2 && (
              <span
                key={progress.streak}
                className="inline-flex animate-pop items-center gap-1 rounded-full bg-warning-soft px-3 py-1 text-sm font-bold text-warning tabular-nums"
                aria-label={`${progress.streak} benar beruntun`}
              >
                <Flame className="size-4" aria-hidden /> ×{progress.streak}
              </span>
            )}
          </>
        )}
        <MuteButton />
      </div>
    </header>
  );
}

export function FeedbackPanel({
  outcome,
  gamification,
}: {
  outcome: AnswerOutcome;
  gamification: boolean;
}) {
  const { result, points, reaction, reveal } = outcome;
  const full = result.ratio === 1;
  const partial = !full && result.ratio > 0;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl p-4",
        full
          ? "animate-pop bg-success-soft"
          : partial
            ? "bg-warning-soft"
            : "animate-shake bg-danger-soft",
      )}
    >
      <p
        className={cn(
          "flex items-center gap-2 text-lg font-bold",
          full ? "text-success" : partial ? "text-warning" : "text-danger",
        )}
      >
        {gamification && reaction ? (
          <span className="text-2xl" aria-hidden>
            {reaction.emoji}
          </span>
        ) : full ? (
          <Check className="size-6" strokeWidth={3} aria-hidden />
        ) : (
          <X className="size-6" strokeWidth={3} aria-hidden />
        )}
        <span>
          {full ? "Benar!" : partial ? `Sebagian benar (${formatResult(result)})` : "Belum tepat"}
          {gamification && reaction && (
            <span className="ml-2 font-semibold">{reaction.message}</span>
          )}
        </span>
        <span className="ml-auto tabular-nums">+{points}</span>
      </p>
      {reveal?.explanation && <p className="text-sm text-fg">{reveal.explanation}</p>}
    </div>
  );
}

export function SummaryScreen({
  summary,
  gamification,
  onRetry,
  onExit,
  exitLabel,
}: {
  summary: AttemptSummary;
  gamification: boolean;
  onRetry?: () => void;
  onExit?: () => void;
  exitLabel: string;
}) {
  if (summary.withheld) {
    return (
      <main className="m-auto flex max-w-md flex-col items-center gap-3 p-6 text-center">
        <p className="text-4xl" aria-hidden>
          📨
        </p>
        <h1 className="text-2xl font-semibold">Jawaban terkirim</h1>
        <p className="text-fg-muted">Nilai akan diumumkan oleh guru.</p>
        {onExit && (
          <Button3D size="md" onClick={onExit}>
            {exitLabel}
          </Button3D>
        )}
      </main>
    );
  }

  const band = scoreBand(summary.percent);
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center gap-6 px-4 py-10 text-center">
      <h1 className="text-2xl font-semibold">Selesai! 🎉</h1>
      <div
        className={cn(
          "flex animate-pop flex-col items-center rounded-3xl px-10 py-6",
          band === "great" && "bg-success-soft text-success",
          band === "ok" && "bg-warning-soft text-warning",
          band === "low" && "bg-danger-soft text-danger",
        )}
      >
        <span className="text-6xl font-bold tabular-nums">{summary.percent}%</span>
        <span className="text-sm font-medium">
          {summary.correctCount} dari {summary.questionCount} benar · {summary.score} poin
        </span>
      </div>

      {gamification && (
        <div className="flex gap-3 text-sm font-semibold">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 shadow-card">
            <Sparkles className="size-4 text-warning" aria-hidden /> {summary.xp} XP
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface px-4 py-2 shadow-card">
            <Flame className="size-4 text-warning" aria-hidden /> Beruntun terbaik{" "}
            {summary.maxStreak}
          </span>
        </div>
      )}

      {summary.review.length > 0 && (
        <ol className="flex w-full flex-col gap-2 text-left">
          {summary.review.map((item, i) => (
            <ReviewRow key={item.questionId} item={item} number={i + 1} />
          ))}
        </ol>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {onRetry && (
          <Button3D size="md" color="#eeeef4" onClick={onRetry}>
            <RotateCcw className="size-4" /> Coba lagi
          </Button3D>
        )}
        {onExit && (
          <Button3D size="md" onClick={onExit}>
            {exitLabel}
          </Button3D>
        )}
      </div>
    </main>
  );
}

function ReviewRow({ item, number }: { item: AttemptSummary["review"][number]; number: number }) {
  const [open, setOpen] = useState(false);
  const state = !item.result
    ? "skip"
    : item.result.ratio === 1
      ? "ok"
      : item.result.ratio > 0
        ? "partial"
        : "wrong";
  return (
    <li className="overflow-hidden rounded-xl bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
            state === "ok" && "bg-success",
            state === "partial" && "bg-warning",
            state === "wrong" && "bg-danger",
            state === "skip" && "bg-line-strong",
          )}
          aria-label={
            { ok: "benar", partial: "sebagian benar", wrong: "salah", skip: "tidak dijawab" }[state]
          }
        >
          {number}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{item.prompt || "Soal"}</span>
        {item.result && (
          <span className="text-xs font-semibold text-fg-muted tabular-nums">
            {formatResult(item.result)}
          </span>
        )}
        <ChevronDown
          className={cn("size-4 text-fg-subtle transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="border-t border-line p-4">
          <QuestionView
            size="sm"
            type={item.type}
            prompt={item.prompt}
            data={item.data}
            answer={item.answer}
            disabled
            reveal={item.reveal?.config}
          >
            {item.reveal?.explanation && (
              <p className="text-sm text-fg-muted">{item.reveal.explanation}</p>
            )}
          </QuestionView>
        </div>
      )}
    </li>
  );
}
