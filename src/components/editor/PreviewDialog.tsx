"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useMemo, useState, type ComponentType } from "react";

import { Button3D } from "@/components/player/Button3D";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { randomSeed } from "@/lib/seed-random";
import { themeStyle } from "@/lib/theme";
import type { Question } from "@/questions/question";
import { getDefinition } from "@/questions/registry";
import type { ScoreResult } from "@/questions/types";
import { questionUI } from "@/questions/ui";
import type { PlayerProps } from "@/questions/ui-types";

import type { QuizDraft } from "./types";

type Prepared =
  { question: Question; data: unknown; config: unknown } | { question: Question; error: string };

/**
 * Plays the current draft inside the editor. Scoring runs in the browser here
 * only because nothing is saved — real sessions score on the server (docs/02).
 */
export function PreviewDialog({
  open,
  onOpenChange,
  quiz,
  questions,
  startIndex = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quiz: QuizDraft;
  questions: Question[];
  startIndex?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-theme-bg text-fg focus:outline-none"
          style={themeStyle(quiz.theme)}
        >
          <DialogPrimitive.Title className="sr-only">Pratinjau quiz</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Mainkan quiz seperti peserta. Jawaban tidak disimpan.
          </DialogPrimitive.Description>
          {open && (
            <PreviewRun
              questions={questions}
              startIndex={startIndex}
              onClose={() => onOpenChange(false)}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PreviewRun({
  questions,
  startIndex,
  onClose,
}: {
  questions: Question[];
  startIndex: number;
  onClose: () => void;
}) {
  const [seed, setSeed] = useState(randomSeed);
  const prepared = useMemo<Prepared[]>(
    () =>
      questions.map((question) => {
        const definition = getDefinition(question.type);
        const parsed = definition.configSchema.safeParse(question.config);
        if (!parsed.success) return { question, error: "Isi soal belum valid." };
        return {
          question,
          config: parsed.data,
          data: definition.stripAnswers(parsed.data, { seed, shuffle: true }),
        };
      }),
    [questions, seed],
  );

  const [index, setIndex] = useState(Math.min(startIndex, Math.max(questions.length - 1, 0)));
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [results, setResults] = useState<Record<string, ScoreResult>>({});
  const [done, setDone] = useState(questions.length === 0);

  const current = prepared[index];
  const result = current ? results[current.question.id] : undefined;

  function submit(answer: unknown) {
    if (!current || "error" in current || results[current.question.id]) return;
    const definition = getDefinition(current.question.type);
    const parsed = definition.answerSchema.safeParse(answer);
    const score = parsed.success
      ? definition.score(current.config, parsed.data)
      : { correct: 0, total: 1, ratio: 0 };
    setResults((r) => ({ ...r, [current.question.id]: score }));
  }

  function next() {
    if (index + 1 >= prepared.length) setDone(true);
    else setIndex(index + 1);
  }

  function restart() {
    setSeed(randomSeed());
    setAnswers({});
    setResults({});
    setIndex(0);
    setDone(questions.length === 0);
  }

  const earned = prepared.reduce((sum, p) => {
    const r = results[p.question.id];
    return sum + (r ? Math.round(p.question.points * r.ratio) : 0);
  }, 0);
  const maxPoints = prepared.reduce((sum, p) => sum + p.question.points, 0);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex items-center gap-3">
        <span className="rounded-full bg-surface px-3 py-1 text-xs font-semibold text-fg-muted shadow-card">
          Pratinjau
        </span>
        {!done && prepared.length > 0 && (
          <div className="flex flex-1 items-center gap-3">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/10">
              <div
                className="h-full rounded-full bg-theme transition-[width] duration-300"
                style={{ width: `${((index + (result ? 1 : 0)) / prepared.length) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-fg-muted tabular-nums">
              {index + 1}/{prepared.length}
            </span>
          </div>
        )}
        <Button variant="secondary" size="sm" className="ml-auto" onClick={onClose}>
          <X /> Tutup
        </Button>
      </header>

      {done ? (
        <Summary
          prepared={prepared}
          results={results}
          earned={earned}
          maxPoints={maxPoints}
          onRestart={restart}
          onClose={onClose}
        />
      ) : current && "error" in current ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-semibold">Soal {index + 1} belum bisa dimainkan</p>
          <p className="text-fg-muted">{current.error}</p>
          <Button3D size="md" onClick={next}>
            Lewati
          </Button3D>
        </div>
      ) : current ? (
        <QuestionStep
          key={current.question.id}
          prepared={current}
          answer={answers[current.question.id] ?? null}
          onAnswer={(a) => setAnswers((all) => ({ ...all, [current.question.id]: a }))}
          onSubmit={submit}
          result={result}
          onNext={next}
          isLast={index + 1 >= prepared.length}
        />
      ) : null}
    </div>
  );
}

function QuestionStep({
  prepared,
  answer,
  onAnswer,
  onSubmit,
  result,
  onNext,
  isLast,
}: {
  prepared: Extract<Prepared, { data: unknown }>;
  answer: unknown;
  onAnswer: (answer: unknown) => void;
  onSubmit: (answer: unknown) => void;
  result: ScoreResult | undefined;
  onNext: () => void;
  isLast: boolean;
}) {
  const { question } = prepared;
  const definition = getDefinition(question.type);
  const ui = questionUI[question.type];
  const Player = ui.Player as ComponentType<PlayerProps<unknown, unknown, unknown>>;
  const answersOnTap =
    (ui.answersOnTap as ((data: unknown) => boolean) | undefined)?.(prepared.data) ?? false;
  const answered = definition.isAnswered(answer as never);

  return (
    <div className="flex flex-1 animate-fade-up flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">
          {question.prompt || <span className="text-fg-subtle italic">Soal tanpa pertanyaan</span>}
        </h2>
        {question.help && <p className="text-fg-muted">{question.help}</p>}
      </div>

      {question.media.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {question.media.map((m) =>
            m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
              <img
                key={m.url}
                src={m.url}
                alt={m.alt ?? ""}
                className="max-h-72 rounded-2xl object-contain shadow-card"
              />
            ) : (
              <audio key={m.url} controls src={m.url} className="w-full max-w-md" />
            ),
          )}
        </div>
      )}

      <Player
        data={prepared.data}
        answer={answer}
        onAnswer={onAnswer}
        onCommit={onSubmit}
        reveal={result ? prepared.config : undefined}
      />

      <div className="flex flex-col gap-3">
        {result ? (
          <>
            <Feedback
              result={result}
              points={Math.round(question.points * result.ratio)}
              explanation={question.explanation}
            />
            <Button3D size="lg" className="self-end" onClick={onNext} autoFocus>
              {isLast ? "Lihat hasil" : "Lanjut"}
            </Button3D>
          </>
        ) : (
          !answersOnTap && (
            <Button3D
              size="lg"
              className="self-end"
              disabled={!answered}
              onClick={() => onSubmit(answer)}
            >
              Kirim jawaban
            </Button3D>
          )
        )}
      </div>
    </div>
  );
}

function Feedback({
  result,
  points,
  explanation,
}: {
  result: ScoreResult;
  points: number;
  explanation: string;
}) {
  const full = result.ratio === 1;
  const partial = !full && result.ratio > 0;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col gap-1 rounded-2xl p-4",
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
        {full ? (
          <Check className="size-6" strokeWidth={3} />
        ) : (
          <X className="size-6" strokeWidth={3} />
        )}
        {full
          ? "Benar!"
          : partial
            ? `Sebagian benar (${result.correct}/${result.total})`
            : "Belum tepat"}
        <span className="ml-auto tabular-nums">+{points}</span>
      </p>
      {explanation && <p className="text-sm text-fg">{explanation}</p>}
    </div>
  );
}

function Summary({
  prepared,
  results,
  earned,
  maxPoints,
  onRestart,
  onClose,
}: {
  prepared: Prepared[];
  results: Record<string, ScoreResult>;
  earned: number;
  maxPoints: number;
  onRestart: () => void;
  onClose: () => void;
}) {
  const pct = maxPoints > 0 ? Math.round((earned / maxPoints) * 100) : 0;
  const tone =
    pct >= 80
      ? "text-success bg-success-soft"
      : pct >= 50
        ? "text-warning bg-warning-soft"
        : "text-danger bg-danger-soft";

  return (
    <div className="flex flex-1 animate-fade-up flex-col items-center gap-6 text-center">
      <h2 className="text-2xl font-semibold">Selesai! 🎉</h2>
      {prepared.length === 0 ? (
        <p className="text-fg-muted">Quiz ini belum punya soal.</p>
      ) : (
        <>
          <div
            className={cn("flex animate-pop flex-col items-center rounded-3xl px-10 py-6", tone)}
          >
            <span className="text-5xl font-bold tabular-nums">{pct}%</span>
            <span className="text-sm font-medium">
              {earned} dari {maxPoints} poin
            </span>
          </div>
          <ol className="flex w-full max-w-md flex-col gap-2 text-left">
            {prepared.map((p, i) => {
              const r = results[p.question.id];
              const state = !r ? "skip" : r.ratio === 1 ? "ok" : r.ratio > 0 ? "partial" : "wrong";
              return (
                <li
                  key={p.question.id}
                  className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2 shadow-card"
                >
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                      state === "ok" && "bg-success",
                      state === "partial" && "bg-warning",
                      state === "wrong" && "bg-danger",
                      state === "skip" && "bg-line-strong",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {p.question.prompt || "Soal tanpa pertanyaan"}
                  </span>
                  {r && (
                    <span className="text-xs font-semibold text-fg-muted tabular-nums">
                      {r.correct}/{r.total}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <div className="flex flex-wrap justify-center gap-3">
        <Button3D size="md" color="#eeeef4" onClick={onRestart}>
          <RotateCcw className="size-4" /> Ulangi
        </Button3D>
        <Button3D size="md" onClick={onClose}>
          Kembali ke editor
        </Button3D>
      </div>
    </div>
  );
}
