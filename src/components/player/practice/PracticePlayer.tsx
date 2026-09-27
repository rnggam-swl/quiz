"use client";

import { LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { Button3D } from "@/components/player/Button3D";
import { answersOnTap, QuestionView } from "@/components/player/QuestionView";
import { EMPTY_PROGRESS, type Progress } from "@/engine/practice/gamification";
import type {
  AnswerOutcome,
  AttemptSummary,
  AttemptView,
  PlayError,
  PlayInfo,
  PracticeAdapter,
  Result,
} from "@/engine/practice/types";
import { playSound } from "@/lib/sound";
import { themeScheme, themeStyle } from "@/lib/theme";
import { getDefinition } from "@/questions/registry";

import { FeedbackPanel, Hud, NicknameForm, SummaryScreen } from "./parts";

export type PlayerEvent =
  | { type: "started"; attemptId: string }
  | { type: "answered"; questionIndex: number; correct?: number; total?: number }
  | {
      type: "completed";
      attemptId: string;
      score: number;
      maxScore: number;
      ratio: number;
      durationMs: number;
    };

type Phase =
  | { kind: "loading" }
  | { kind: "nickname"; error?: string }
  | { kind: "welcomeBack" }
  | { kind: "playing" }
  | { kind: "finishing" }
  | { kind: "summary"; summary: AttemptSummary }
  | { kind: "blocked"; message: string };

const ERROR_TEXT: Partial<Record<PlayError, string>> = {
  session_closed: "Sesi ini sudah ditutup oleh guru.",
  attempt_limit: "Kamu sudah memakai semua kesempatan untuk quiz ini.",
  not_found: "Quiz tidak ditemukan.",
  deadline_passed: "Waktu mengerjakan sudah habis.",
};

const RETRY_DELAYS_MS = [800, 2000, 4000];
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Call the adapter, retrying network failures (thrown or reported) a few times. */
async function withRetry<R extends Result<object>>(call: () => Promise<R>): Promise<R> {
  const once = () => call().catch(() => ({ ok: false, error: "network" }) as R);
  let result = await once();
  for (const delay of RETRY_DELAYS_MS) {
    if (result.ok || result.error !== "network") break;
    await wait(delay);
    result = await once();
  }
  return result;
}

function readToken(key: string | null): string | null {
  if (!key) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToken(key: string | null, token: string | null): void {
  if (!key) return;
  try {
    if (token) localStorage.setItem(key, token);
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked: the attempt still works, it just won't survive a reload.
  }
}

/**
 * The self-paced player (docs/06-mode-practice.md). Talks to the outside world
 * only through `adapter`, so the same UI runs against Server Actions, an embed,
 * or the in-memory preview.
 */
export function PracticePlayer({
  info,
  adapter,
  storageKey,
  autoJoinAs,
  onEvent,
  onExit,
  exitLabel = "Selesai",
  className,
}: {
  info: PlayInfo;
  adapter: PracticeAdapter;
  /** localStorage key for the participant token (null = don't persist, e.g. preview). */
  storageKey: string | null;
  /** Skip the nickname screen (preview, or an embed token that carries the name). */
  autoJoinAs?: string;
  onEvent?: (event: PlayerEvent) => void;
  onExit?: () => void;
  exitLabel?: string;
  className?: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [token, setToken] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<AttemptView | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [outcomes, setOutcomes] = useState<Record<string, AnswerOutcome | undefined>>({});
  const [done, setDone] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Progress>(EMPTY_PROGRESS);
  const [busy, setBusy] = useState(false);
  // What to retry after a network failure (kept as data, not a closure).
  const [pendingRetry, setPendingRetry] = useState<
    null | { kind: "answer"; answer: unknown } | { kind: "finish" }
  >(null);
  const shownAt = useRef(0);
  const startedAt = useRef(0);
  const eventRef = useRef(onEvent);
  useEffect(() => {
    eventRef.current = onEvent;
  }, [onEvent]);

  const questions = attempt?.questions ?? [];
  const current = questions[index];

  const begin = useCallback(
    async (activeToken: string, resumeOnly = false) => {
      setPhase({ kind: "loading" });
      const result = await withRetry(() => adapter.start(activeToken, { resumeOnly }));
      if (!result.ok) {
        if (result.error === "no_open_attempt") {
          setPhase({ kind: "welcomeBack" });
        } else if (result.error === "unauthorized" || result.error === "not_found") {
          writeToken(storageKey, null);
          setToken(null);
          setPhase({ kind: "nickname" });
        } else {
          setPhase({
            kind: "blocked",
            message:
              ERROR_TEXT[result.error] ??
              "Tidak bisa memuat quiz. Periksa koneksi lalu muat ulang.",
          });
        }
        return;
      }
      const view = result.attempt;
      const answeredIds = new Set(Object.keys(view.answered));
      setAttempt(view);
      setAnswers(
        Object.fromEntries(Object.entries(view.answered).map(([id, a]) => [id, a.answer])),
      );
      setOutcomes(
        Object.fromEntries(Object.entries(view.answered).map(([id, a]) => [id, a.outcome])),
      );
      setDone(answeredIds);
      setProgress(view.progress);
      const firstOpen = view.questions.findIndex((q) => !answeredIds.has(q.id));
      setIndex(firstOpen === -1 ? Math.max(view.questions.length - 1, 0) : firstOpen);
      shownAt.current = performance.now();
      startedAt.current = Date.now();
      setPhase({ kind: "playing" });
      eventRef.current?.({ type: "started", attemptId: view.attemptId });
    },
    [adapter, storageKey],
  );

  const join = useCallback(
    async (nickname: string) => {
      setBusy(true);
      const result = await withRetry(() => adapter.join(nickname));
      setBusy(false);
      if (!result.ok) {
        const message =
          result.error === "invalid"
            ? "Pakai nama panggilan yang lain, ya."
            : (ERROR_TEXT[result.error] ?? "Gagal bergabung. Coba lagi.");
        if (result.error === "session_closed") setPhase({ kind: "blocked", message });
        else setPhase({ kind: "nickname", error: message });
        return;
      }
      writeToken(storageKey, result.token);
      setToken(result.token);
      await begin(result.token);
    },
    [adapter, begin, storageKey],
  );

  // Resume with a stored token, auto-join, or ask for a nickname.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const stored = readToken(storageKey);
    void (async () => {
      if (stored) {
        setToken(stored);
        // Only resume: a reload after finishing must not silently start a new attempt.
        await begin(stored, true);
      } else if (autoJoinAs) {
        await join(autoJoinAs);
      } else {
        setPhase({ kind: "nickname" });
      }
    })();
  }, [autoJoinAs, begin, join, storageKey]);

  const finish = useCallback(async () => {
    if (!token || !attempt) return;
    setPhase({ kind: "finishing" });
    const result = await withRetry(() => adapter.finish(token, attempt.attemptId));
    if (!result.ok) {
      setPhase({ kind: "playing" });
      setPendingRetry({ kind: "finish" });
      return;
    }
    const { summary } = result;
    setPhase({ kind: "summary", summary });
    if (!summary.withheld) {
      eventRef.current?.({
        type: "completed",
        attemptId: attempt.attemptId,
        score: summary.score,
        maxScore: summary.maxScore,
        ratio: summary.maxScore > 0 ? summary.score / summary.maxScore : 0,
        durationMs: Date.now() - startedAt.current,
      });
      if (summary.percent >= 80) {
        playSound("fanfare");
        void import("canvas-confetti").then(({ default: confetti }) =>
          confetti({
            particleCount: 140,
            spread: 80,
            origin: { y: 0.55 },
            disableForReducedMotion: true,
          }),
        );
      }
    }
  }, [adapter, attempt, token]);

  const next = useCallback(() => {
    if (index + 1 >= questions.length) {
      void finish();
      return;
    }
    setIndex(index + 1);
    shownAt.current = performance.now();
  }, [finish, index, questions.length]);

  const submit = useCallback(
    async (answer: unknown) => {
      if (!token || !attempt || !current || busy || done.has(current.id)) return;
      setBusy(true);
      setPendingRetry(null);
      const question = current;
      const timeMs = performance.now() - shownAt.current;
      const result = await withRetry(() =>
        adapter.answer(token, attempt.attemptId, question.id, answer, timeMs),
      );
      setBusy(false);

      if (!result.ok && result.error === "network") {
        setPendingRetry({ kind: "answer", answer });
        return;
      }
      if (!result.ok && result.error !== "already_answered") {
        setPhase({
          kind: "blocked",
          message:
            ERROR_TEXT[result.error] ?? "Jawaban tidak bisa dikirim. Muat ulang halaman ini.",
        });
        return;
      }

      setDone((d) => new Set(d).add(question.id));
      const outcome = result.ok ? result.outcome : undefined;
      eventRef.current?.({
        type: "answered",
        questionIndex: index,
        ...(outcome && { correct: outcome.result.correct, total: outcome.result.total }),
      });
      if (!outcome) {
        playSound("tap");
        next();
        return;
      }
      setOutcomes((o) => ({ ...o, [question.id]: outcome }));
      if (outcome.progress) setProgress(outcome.progress);
      playSound(
        outcome.result.ratio === 1 ? "correct" : outcome.result.ratio > 0 ? "partial" : "wrong",
      );
    },
    [adapter, attempt, busy, current, done, index, next, token],
  );

  function retry() {
    const pending = pendingRetry;
    setPendingRetry(null);
    if (pending?.kind === "answer") void submit(pending.answer);
    else if (pending?.kind === "finish") void finish();
  }

  const style = themeStyle(info.theme) as CSSProperties;
  const scheme = themeScheme(info.theme);
  const shell = `flex min-h-full flex-1 flex-col bg-theme-bg text-fg ${className ?? ""}`;

  if (phase.kind === "loading" || phase.kind === "finishing") {
    return (
      <div className={shell} style={style} data-scheme={scheme}>
        <div className="flex flex-1 items-center justify-center gap-2 text-fg-muted" role="status">
          <LoaderCircle className="size-5 animate-spin" />
          {phase.kind === "finishing" ? "Menghitung skor…" : "Memuat quiz…"}
        </div>
      </div>
    );
  }

  if (phase.kind === "blocked") {
    return (
      <div className={shell} style={style} data-scheme={scheme}>
        <div className="m-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
          <p className="text-4xl" aria-hidden>
            🔒
          </p>
          <p className="text-lg font-semibold">{phase.message}</p>
          {onExit && (
            <Button3D size="md" onClick={onExit}>
              {exitLabel}
            </Button3D>
          )}
        </div>
      </div>
    );
  }

  if (phase.kind === "welcomeBack") {
    return (
      <div className={shell} style={style} data-scheme={scheme}>
        <div className="m-auto flex max-w-sm flex-col items-center gap-4 p-6 text-center">
          <p className="text-4xl" aria-hidden>
            👋
          </p>
          <h1 className="text-xl font-semibold">{info.title || "Quiz"}</h1>
          <p className="text-fg-muted">Kamu sudah pernah mengerjakan quiz ini.</p>
          <Button3D size="lg" onClick={() => token && void begin(token)}>
            Mulai lagi
          </Button3D>
          {onExit && (
            <button type="button" onClick={onExit} className="text-sm text-fg-muted underline">
              {exitLabel}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (phase.kind === "nickname") {
    return (
      <div className={shell} style={style} data-scheme={scheme}>
        <NicknameForm info={info} busy={busy} error={phase.error} onSubmit={join} />
      </div>
    );
  }

  if (phase.kind === "summary") {
    return (
      <div className={shell} style={style} data-scheme={scheme}>
        <SummaryScreen
          summary={phase.summary}
          gamification={info.policy.gamification}
          onRetry={phase.summary.canRetry && token ? () => void begin(token) : undefined}
          onExit={onExit}
          exitLabel={exitLabel}
        />
      </div>
    );
  }

  // Playing.
  if (!current) {
    return (
      <div className={shell} style={style} data-scheme={scheme}>
        <p className="m-auto p-6 text-center text-fg-muted">Quiz ini belum punya soal.</p>
      </div>
    );
  }

  const outcome = outcomes[current.id];
  const answered = done.has(current.id);
  const answer = answers[current.id] ?? null;
  const tap = answersOnTap(current.type, current.data);
  const canSubmit = getDefinition(current.type).isAnswered(answer as never);
  const isLast = index + 1 >= questions.length;

  return (
    <div className={shell} style={style} data-scheme={scheme}>
      <Hud
        index={index}
        total={questions.length}
        answeredCount={done.size}
        progress={progress}
        // With feedback at the end there is no running XP to show until the summary.
        gamification={info.policy.gamification && info.policy.feedback === "instant"}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
        <div key={current.id} className="animate-fade-up">
          <QuestionView
            type={current.type}
            prompt={current.prompt}
            help={current.help}
            media={current.media}
            data={current.data}
            answer={answer}
            onAnswer={(a) => setAnswers((all) => ({ ...all, [current.id]: a }))}
            onCommit={(a) => void submit(a)}
            disabled={answered || busy}
            reveal={outcome?.reveal?.config}
          />
        </div>

        {pendingRetry && (
          <div
            role="alert"
            className="flex items-center gap-3 rounded-xl bg-warning-soft p-3 text-sm text-warning"
          >
            <span className="flex-1">Koneksi terputus. Jawabanmu belum terkirim.</span>
            <Button3D size="md" onClick={retry}>
              Coba lagi
            </Button3D>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {outcome ? (
            <>
              <FeedbackPanel outcome={outcome} gamification={info.policy.gamification} />
              <Button3D size="lg" className="self-end" onClick={next} autoFocus>
                {isLast ? "Lihat hasil" : "Lanjut"}
              </Button3D>
            </>
          ) : answered ? (
            <Button3D size="lg" className="self-end" onClick={next}>
              {isLast ? "Kirim semua jawaban" : "Lanjut"}
            </Button3D>
          ) : (
            (!tap || busy) && (
              <Button3D
                size="lg"
                className="self-end"
                disabled={!canSubmit || busy}
                onClick={() => void submit(answer)}
              >
                {busy && <LoaderCircle className="size-4 animate-spin" />}
                {info.policy.feedback === "instant"
                  ? "Kirim jawaban"
                  : isLast
                    ? "Kirim & selesai"
                    : "Simpan & lanjut"}
              </Button3D>
            )
          )}
        </div>
      </main>
    </div>
  );
}
