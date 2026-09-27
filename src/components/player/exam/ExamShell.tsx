"use client";

import {
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CloudOff,
  Flag,
  LayoutGrid,
  LoaderCircle,
  Send,
  Timer,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { QuestionView } from "@/components/player/QuestionView";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { formatCountdown } from "@/engine/exam/deadline";
import {
  canVisit,
  markOf,
  submitCheck,
  submitWarning,
  type QuestionMark,
} from "@/engine/exam/navigation";
import type { ExamAdapter, ExamInfo, ExamResult, ExamView } from "@/engine/exam/types";
import { cn } from "@/lib/cn";
import { StoryLoaderContext } from "@/questions/branching/story-loader";
import { getDefinition } from "@/questions/registry";

import { useCountdown } from "./useCountdown";
import { useIntegrity } from "./useIntegrity";
import { useSaveQueue, type SaveStatus } from "./useSaveQueue";

const FLUSH_DEBOUNCE_MS = 600;

function readFlags(key: string | null): Set<string> {
  if (!key || typeof localStorage === "undefined") return new Set();
  try {
    return new Set(JSON.parse(localStorage.getItem(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function SaveBadge({ status, pending }: { status: SaveStatus; pending: number }) {
  const offline = status === "offline";
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs font-medium",
        offline ? "text-warning" : "text-fg-muted",
      )}
    >
      {status === "saving" && <LoaderCircle className="size-3.5 animate-spin" aria-hidden />}
      {status === "saved" && <CircleCheck className="size-3.5 text-success" aria-hidden />}
      {offline && <CloudOff className="size-3.5" aria-hidden />}
      {status === "saving"
        ? "Menyimpan…"
        : offline
          ? `Offline — ${pending} jawaban akan dikirim ulang`
          : status === "closed"
            ? "Waktu habis"
            : "Tersimpan"}
    </span>
  );
}

function NumberPanel({
  marks,
  current,
  navigation,
  onGo,
}: {
  marks: QuestionMark[];
  current: number;
  navigation: ExamInfo["navigation"];
  onGo: (index: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <ol className="grid grid-cols-5 gap-2" aria-label="Nomor soal">
        {marks.map((mark, i) => (
          <li key={i}>
            <button
              type="button"
              onClick={() => onGo(i)}
              disabled={!canVisit(navigation, current, i, marks.length)}
              aria-current={i === current ? "step" : undefined}
              aria-label={`Soal ${i + 1}: ${
                mark === "answered"
                  ? "sudah dijawab"
                  : mark === "flagged"
                    ? "ragu-ragu"
                    : "belum dijawab"
              }`}
              className={cn(
                "relative flex h-10 w-full items-center justify-center rounded-lg border-2 text-sm font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                mark === "answered" && "border-theme bg-theme text-on-theme",
                mark === "flagged" && "border-warning bg-warning-soft text-warning",
                mark === "empty" && "border-line bg-surface text-fg",
                i === current && "ring-2 ring-fg ring-offset-2 ring-offset-canvas",
              )}
            >
              {i + 1}
              {mark === "flagged" && (
                <Flag className="absolute -top-1.5 -right-1.5 size-3.5 fill-current" aria-hidden />
              )}
            </button>
          </li>
        ))}
      </ol>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-fg-muted">
        <li className="inline-flex items-center gap-1">
          <span className="size-3 rounded bg-theme" aria-hidden /> Dijawab
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="size-3 rounded border-2 border-warning bg-warning-soft" aria-hidden />{" "}
          Ragu-ragu
        </li>
        <li className="inline-flex items-center gap-1">
          <span className="size-3 rounded border-2 border-line" aria-hidden /> Belum
        </li>
      </ul>
    </div>
  );
}

/**
 * The running exam: neutral look (no XP, sounds or reactions), a server-synced timer,
 * a number panel with doubts, autosave with an offline queue, and integrity logging.
 */
export function ExamShell({
  info,
  exam,
  adapter,
  token,
  storageKey,
  onFinished,
}: {
  info: ExamInfo;
  exam: ExamView;
  adapter: ExamAdapter;
  token: string;
  storageKey: string | null;
  onFinished: (result: ExamResult) => void;
}) {
  const { questions, attemptId } = exam;
  const flagsKey = storageKey && `${storageKey}:flags:${attemptId}`;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>(exam.answers);
  const [flags, setFlags] = useState(() => readFlags(flagsKey));
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState(false);
  const area = useRef<HTMLElement>(null);
  // When the current question appeared, for the time-per-question in reports.
  const [mountedAt] = useState(() => Date.now());
  const shownAt = useRef(mountedAt);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const save = useCallback(
    (questionId: string, answer: unknown, timeMs: number) =>
      adapter.save(token, attemptId, questionId, answer, timeMs),
    [adapter, token, attemptId],
  );
  const queue = useSaveQueue(storageKey && `${storageKey}:queue:${attemptId}`, save);
  const sendIntegrity = useCallback(
    (events: Parameters<ExamAdapter["logIntegrity"]>[2]) =>
      adapter.logIntegrity(token, attemptId, events),
    [adapter, token, attemptId],
  );
  useIntegrity({
    active: !finishing,
    integrity: info.integrity,
    questionArea: area,
    send: sendIntegrity,
  });

  const finish = useCallback(async () => {
    setConfirmOpen(false);
    setFinishing(true);
    setFinishError(false);
    clearTimeout(flushTimer.current);
    // Give queued answers a few chances; anything the server already has is safe.
    for (let i = 0; i < 3 && !(await queue.flush()); i++) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    const result = await adapter.finish(token, attemptId).catch(() => null);
    if (result?.ok) onFinished(result.result);
    else setFinishError(true);
  }, [adapter, token, attemptId, onFinished, queue]);

  const remaining = useCountdown(exam.deadline, exam.serverNow, () => void finish());
  const timeUp = remaining === 0;

  // The server refused an answer because the attempt is over (time moved by the teacher,
  // or the device clock ran slow): hand in what's saved and show the receipt.
  const closed = queue.status === "closed";
  const handedIn = useRef(false);
  useEffect(() => {
    if (!closed || handedIn.current) return;
    const timer = setTimeout(() => {
      handedIn.current = true;
      void finish();
    }, 0);
    return () => clearTimeout(timer);
  }, [closed, finish]);

  const question = questions[index]!;
  const marks = useMemo(
    () =>
      questions.map((q) =>
        markOf(getDefinition(q.type).isAnswered(answers[q.id] as never), flags.has(q.id)),
      ),
    [questions, answers, flags],
  );

  function answer(value: unknown) {
    setAnswers((a) => ({ ...a, [question.id]: value }));
    queue.enqueue(question.id, value, Date.now() - shownAt.current);
    clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => void queue.flush(), FLUSH_DEBOUNCE_MS);
  }

  function go(target: number) {
    if (!canVisit(info.navigation, index, target, questions.length)) return;
    void queue.flush();
    setIndex(target);
    setPanelOpen(false);
    shownAt.current = Date.now();
    window.scrollTo({ top: 0 });
  }

  function toggleFlag() {
    const next = new Set(flags);
    if (next.has(question.id)) next.delete(question.id);
    else next.add(question.id);
    setFlags(next);
    try {
      if (flagsKey) localStorage.setItem(flagsKey, JSON.stringify([...next]));
    } catch {
      // Flags are a convenience; losing them on reload is acceptable.
    }
  }

  const loadStory = useCallback(
    async (path: string[]) => {
      const result = await adapter.storyStep(token, attemptId, question.id, path).catch(() => null);
      return result?.ok ? result.nodes : null;
    },
    [adapter, token, attemptId, question.id],
  );

  const check = submitCheck(marks);
  const warning = submitWarning(check);
  const last = index === questions.length - 1;
  const lowTime = remaining !== null && remaining < 5 * 60_000;
  const locked = finishing || timeUp || queue.status === "closed";

  if (finishing || timeUp) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas p-6 text-center">
        {finishError ? (
          <>
            <CloudOff className="size-8 text-warning" aria-hidden />
            <p className="max-w-sm text-fg">
              Jawaban belum terkirim karena koneksi terputus. Jawaban yang sudah tersimpan aman.
            </p>
            <Button onClick={() => void finish()}>Coba kirim lagi</Button>
          </>
        ) : (
          <>
            <LoaderCircle className="size-8 animate-spin text-fg-muted" aria-hidden />
            <p role="status" className="text-fg">
              {timeUp ? "Waktu habis. Mengirim jawabanmu…" : "Mengirim jawaban…"}
            </p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-fg">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4">
          <p className="min-w-0 flex-1 truncate font-semibold">{info.title}</p>
          <SaveBadge status={queue.status} pending={queue.pendingCount} />
          {remaining !== null && (
            <span
              role="timer"
              aria-label={`Sisa waktu ${formatCountdown(remaining)}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold tabular-nums",
                remaining < 60_000
                  ? "bg-danger-soft text-danger"
                  : lowTime
                    ? "bg-warning-soft text-warning"
                    : "bg-surface-muted text-fg",
              )}
            >
              <Timer className="size-4" aria-hidden />
              {formatCountdown(remaining)}
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            className="lg:hidden"
            onClick={() => setPanelOpen(true)}
            aria-label="Daftar soal"
          >
            <LayoutGrid />
          </Button>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-4 py-6">
        <main
          ref={area}
          className="flex min-w-0 flex-1 flex-col gap-6"
          // Right-click menus are a common way to copy; block them with copy/paste.
          onContextMenu={info.integrity.blockCopyPaste ? (e) => e.preventDefault() : undefined}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-fg-muted">
              Soal {index + 1} dari {questions.length}
            </span>
            <Button
              variant={flags.has(question.id) ? "secondary" : "ghost"}
              size="sm"
              onClick={toggleFlag}
              aria-pressed={flags.has(question.id)}
              className={cn(flags.has(question.id) && "border-warning text-warning")}
            >
              <Flag className={cn(flags.has(question.id) && "fill-current")} /> Ragu-ragu
            </Button>
          </div>

          <StoryLoaderContext.Provider value={loadStory}>
            <QuestionView
              key={question.id}
              type={question.type}
              prompt={question.prompt}
              help={question.help}
              media={question.media}
              data={question.data}
              answer={answers[question.id] ?? null}
              onAnswer={answer}
              disabled={locked}
            />
          </StoryLoaderContext.Provider>

          <nav className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-4">
            <Button
              variant="secondary"
              onClick={() => go(index - 1)}
              disabled={
                index === 0 || !canVisit(info.navigation, index, index - 1, questions.length)
              }
            >
              <ChevronLeft /> Sebelumnya
            </Button>
            {last ? (
              <Button onClick={() => setConfirmOpen(true)} disabled={locked}>
                <Send /> Selesai
              </Button>
            ) : (
              <Button onClick={() => go(index + 1)}>
                Berikutnya <ChevronRight />
              </Button>
            )}
          </nav>
        </main>

        <aside className="hidden w-64 shrink-0 flex-col gap-4 lg:flex">
          <NumberPanel marks={marks} current={index} navigation={info.navigation} onGo={go} />
          <Button variant="secondary" onClick={() => setConfirmOpen(true)} disabled={locked}>
            <Send /> Kirim jawaban
          </Button>
        </aside>
      </div>

      <Dialog open={panelOpen} onOpenChange={setPanelOpen}>
        <DialogContent title="Daftar soal">
          <NumberPanel marks={marks} current={index} navigation={info.navigation} onGo={go} />
          <Button
            variant="secondary"
            onClick={() => {
              setPanelOpen(false);
              setConfirmOpen(true);
            }}
            disabled={locked}
          >
            <Send /> Kirim jawaban
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          title="Kirim jawaban sekarang?"
          description={
            warning
              ? `${warning} Setelah dikirim, jawaban tidak bisa diubah.`
              : "Semua soal sudah dijawab. Setelah dikirim, jawaban tidak bisa diubah."
          }
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Periksa lagi</Button>
            </DialogClose>
            <Button onClick={() => void finish()}>
              <Send /> Kirim
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
