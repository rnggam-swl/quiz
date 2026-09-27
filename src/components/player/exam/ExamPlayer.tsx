"use client";

import {
  CalendarClock,
  CircleCheck,
  ClipboardList,
  Clock,
  LoaderCircle,
  LogIn,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { QuestionView } from "@/components/player/QuestionView";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import type { ExamAdapter, ExamInfo, ExamResult, ExamView } from "@/engine/exam/types";
import type { PlayError } from "@/engine/practice/types";
import { cn } from "@/lib/cn";
import { formatResult } from "@/lib/format";

import { ExamShell } from "./ExamShell";
import { requestFullscreen } from "./useIntegrity";

type Phase =
  | { kind: "loading" }
  | { kind: "landing"; error?: string }
  | { kind: "running"; token: string; exam: ExamView; notice?: string }
  | { kind: "result"; token: string; result: ExamResult }
  | { kind: "blocked"; message: string };

const ERRORS: Partial<Record<PlayError, string>> = {
  passcode: "Kode akses salah.",
  not_on_roster: "NIS/email itu tidak ada di daftar peserta ujian ini.",
  login_required: "Masuk ke akunmu dulu untuk mengikuti ujian ini.",
  not_open_yet: "Ujian belum dibuka.",
  session_closed: "Ujian sudah ditutup.",
  attempt_limit: "Kamu sudah memakai semua kesempatan untuk ujian ini.",
  invalid: "Periksa lagi isian kamu.",
  not_found: "Ujian tidak ditemukan.",
  network: "Koneksi bermasalah. Coba lagi.",
};

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
    // Storage blocked: the exam works, it just can't be resumed after closing the tab.
  }
}

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

function Facts({ info }: { info: ExamInfo }) {
  const minutes = info.durationS ? Math.round(info.durationS / 60) : null;
  const facts: [ReactNode, string][] = [
    [<ClipboardList key="q" className="size-4" />, `${info.questionCount} soal`],
    [<Clock key="t" className="size-4" />, minutes ? `${minutes} menit` : "Tanpa batas waktu"],
  ];
  if (info.closesAt) {
    facts.push([
      <CalendarClock key="c" className="size-4" />,
      `Ditutup ${dateTime(info.closesAt)}`,
    ]);
  }
  return (
    <ul className="flex flex-wrap justify-center gap-2 text-sm">
      {facts.map(([icon, text]) => (
        <li
          key={text}
          className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-fg-muted"
        >
          {icon}
          {text}
        </li>
      ))}
    </ul>
  );
}

function Rules({ info }: { info: ExamInfo }) {
  const rules = [
    info.navigation === "forward"
      ? "Soal dikerjakan berurutan; soal yang sudah dilewati tidak bisa dibuka lagi."
      : "Kamu boleh berpindah soal dan menandai soal yang masih ragu-ragu.",
    "Jawaban tersimpan otomatis. Kalau browser tertutup, buka lagi halaman ini untuk melanjutkan.",
    info.durationS &&
      "Waktu terus berjalan walau browser ditutup. Saat waktu habis, jawaban dikirim otomatis.",
    info.integrity.fullscreen &&
      "Ujian berjalan dalam layar penuh. Keluar dari layar penuh akan dicatat.",
    info.integrity.logTabSwitch && "Pindah tab atau aplikasi akan dicatat dan terlihat oleh guru.",
    info.integrity.blockCopyPaste && "Menyalin dan menempel di area soal dinonaktifkan.",
  ].filter(Boolean) as string[];
  return (
    <ul className="flex flex-col gap-2 text-left text-sm text-fg-muted">
      {rules.map((rule) => (
        <li key={rule} className="flex gap-2">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-fg-subtle" aria-hidden />
          {rule}
        </li>
      ))}
    </ul>
  );
}

function ResultScreen({
  info,
  result,
  onRefresh,
  onAgain,
  busy,
}: {
  info: ExamInfo;
  result: ExamResult;
  onRefresh: () => void;
  onAgain: () => void;
  busy: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-5 text-center">
      <CircleCheck className="size-12 text-success" aria-hidden />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Jawaban terkirim</h1>
        <p className="text-fg-muted">
          {result.status === "expired"
            ? "Waktu habis — jawaban yang sudah tersimpan dikirim otomatis."
            : `Terkirim${result.submittedAt ? ` ${dateTime(result.submittedAt)}` : ""}.`}
        </p>
      </div>

      {result.released && result.percent !== undefined ? (
        <div className="flex flex-col items-center gap-1 rounded-2xl bg-surface px-10 py-6 shadow-card">
          <span className="text-sm text-fg-muted">Nilai</span>
          <span className="text-5xl font-bold tabular-nums">{result.percent}</span>
          <span className="text-sm text-fg-muted tabular-nums">
            {result.score} / {result.maxScore} poin
          </span>
          {!!result.pendingCount && (
            <span className="mt-2 text-xs text-warning">
              {result.pendingCount} jawaban esai masih dinilai guru; nilai bisa berubah.
            </span>
          )}
        </div>
      ) : (
        <p className="max-w-sm rounded-2xl bg-surface-muted p-4 text-sm text-fg-muted">
          {info.releaseResults === "after_close"
            ? "Nilai diumumkan setelah ujian ditutup. Buka lagi halaman ini nanti."
            : "Nilai diumumkan oleh guru. Buka lagi halaman ini nanti."}
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        {!result.released && (
          <Button variant="secondary" onClick={onRefresh} disabled={busy}>
            {busy && <LoaderCircle className="animate-spin" />} Cek nilai
          </Button>
        )}
        {result.canRetry && (
          <Button onClick={onAgain} disabled={busy}>
            Kerjakan lagi (percobaan {result.attemptNo + 1})
          </Button>
        )}
      </div>

      {result.review && (
        <ol className="flex w-full flex-col gap-4 text-left">
          {result.review.map((item, i) => (
            <li key={item.questionId} className="rounded-2xl bg-surface p-4 shadow-card">
              <p className="mb-2 text-xs font-semibold text-fg-muted">
                Soal {i + 1}
                {item.result && ` · ${formatResult(item.result)}`}
                {item.pending && " · menunggu penilaian"}
              </p>
              <QuestionView
                type={item.type}
                prompt={item.prompt}
                data={item.data}
                answer={item.answer}
                reveal={item.reveal?.config}
                disabled
                size="sm"
              >
                {item.reveal?.explanation && (
                  <p className="text-sm text-fg-muted">{item.reveal.explanation}</p>
                )}
              </QuestionView>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * The participant's side of an exam: landing page with the rules (and a join form),
 * the running exam, and the receipt/score afterwards. The token in localStorage lets a
 * participant come back to the same attempt — or to their score once it's released.
 */
export function ExamPlayer({
  info,
  adapter,
  storageKey,
  loginHref,
}: {
  info: ExamInfo;
  adapter: ExamAdapter;
  /** localStorage key for the participant token (null = don't persist). */
  storageKey: string | null;
  /** Where "Masuk" goes for exams that need an account. */
  loginHref?: string;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [nickname, setNickname] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [passcode, setPasscode] = useState("");

  const begin = useCallback(
    async (token: string, options?: { again?: boolean; notice?: string }) => {
      const res = await adapter.start(token, { again: options?.again }).catch(() => null);
      if (!res) return setPhase({ kind: "landing", error: ERRORS.network });
      if (!res.ok) {
        if (res.error === "unauthorized" || res.error === "not_found") {
          writeToken(storageKey, null);
          return setPhase({ kind: "landing" });
        }
        return setPhase({ kind: "landing", error: ERRORS[res.error] ?? ERRORS.network });
      }
      if ("result" in res) return setPhase({ kind: "result", token, result: res.result });
      setPhase({ kind: "running", token, exam: res.exam, notice: options?.notice });
    },
    [adapter, storageKey],
  );

  // Resume with a stored token (the running attempt, or the result), else show the landing.
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const stored = readToken(storageKey);
    void (async () => {
      if (stored) await begin(stored);
      else setPhase({ kind: "landing" });
    })();
  }, [begin, storageKey]);

  async function join(e: FormEvent) {
    e.preventDefault();
    // Fullscreen has to be requested inside the click.
    if (info.integrity.fullscreen) requestFullscreen();
    setBusy(true);
    const res = await adapter
      .join({
        ...(info.access === "open" && { nickname }),
        ...(info.access === "roster" && { identifier }),
        ...(info.needsPasscode && { passcode }),
      })
      .catch(() => null);
    if (!res?.ok) {
      setBusy(false);
      return setPhase({
        kind: "landing",
        error: ERRORS[res?.error ?? "network"] ?? ERRORS.network,
      });
    }
    writeToken(storageKey, res.token);
    await begin(res.token, {
      notice: res.otherDevice
        ? "Ujian ini sedang dikerjakan di perangkat lain. Kamu melanjutkannya di sini — hal ini dicatat."
        : undefined,
    });
    setBusy(false);
  }

  async function refresh(token: string, again = false) {
    setBusy(true);
    if (again && info.integrity.fullscreen) requestFullscreen();
    await begin(token, { again });
    setBusy(false);
  }

  if (phase.kind === "running") {
    return (
      <>
        {phase.notice && (
          <p role="alert" className="bg-warning-soft px-4 py-2 text-center text-sm text-warning">
            {phase.notice}
          </p>
        )}
        <ExamShell
          key={phase.exam.attemptId}
          info={info}
          exam={phase.exam}
          adapter={adapter}
          token={phase.token}
          storageKey={storageKey}
          onFinished={(result) => {
            if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
            setPhase({ kind: "result", token: phase.token, result });
          }}
        />
      </>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-6 px-4 py-10">
      {phase.kind === "loading" && (
        <p role="status" className="flex items-center justify-center gap-2 text-fg-muted">
          <LoaderCircle className="size-5 animate-spin" /> Memuat ujian…
        </p>
      )}

      {phase.kind === "blocked" && <p className="text-center text-fg">{phase.message}</p>}

      {phase.kind === "result" && (
        <ResultScreen
          info={info}
          result={phase.result}
          busy={busy}
          onRefresh={() => void refresh(phase.token)}
          onAgain={() => void refresh(phase.token, true)}
        />
      )}

      {phase.kind === "landing" && (
        <>
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold tracking-wide text-accent-fg uppercase">
              Ujian
            </span>
            <h1 className="text-2xl font-semibold text-balance">{info.title}</h1>
            {info.description && <p className="text-fg-muted">{info.description}</p>}
            <Facts info={info} />
          </div>

          {info.phase === "upcoming" && info.opensAt && (
            <p className="rounded-2xl bg-surface-muted p-4 text-center text-fg-muted">
              Ujian dibuka <strong className="text-fg">{dateTime(info.opensAt)}</strong>. Muat ulang
              halaman ini saat waktunya tiba.
            </p>
          )}
          {info.phase === "closed" && (
            <p className="rounded-2xl bg-surface-muted p-4 text-center text-fg-muted">
              Ujian ini sudah ditutup.
            </p>
          )}

          {info.phase === "open" && (
            <form
              onSubmit={join}
              className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
            >
              <Rules info={info} />
              {info.access === "open" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exam-name">Nama lengkap</Label>
                  <Input
                    id="exam-name"
                    value={nickname}
                    maxLength={24}
                    autoComplete="name"
                    onChange={(e) => setNickname(e.target.value)}
                    required
                  />
                </div>
              )}
              {info.access === "roster" && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exam-id">NIS atau email</Label>
                  <Input
                    id="exam-id"
                    value={identifier}
                    maxLength={120}
                    autoComplete="off"
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
              )}
              {info.needsPasscode && (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="exam-passcode">Kode akses</Label>
                  <Input
                    id="exam-passcode"
                    value={passcode}
                    maxLength={40}
                    autoComplete="off"
                    onChange={(e) => setPasscode(e.target.value)}
                    required
                  />
                </div>
              )}
              {phase.error && (
                <p role="alert" className="text-sm text-danger">
                  {phase.error}
                </p>
              )}
              {info.access === "login" && phase.error === ERRORS.login_required && loginHref && (
                <Button asChild variant="secondary">
                  <Link href={loginHref}>
                    <LogIn /> Masuk
                  </Link>
                </Button>
              )}
              <Button type="submit" size="lg" disabled={busy}>
                {busy && <LoaderCircle className="animate-spin" />} Mulai ujian
              </Button>
            </form>
          )}

          {phase.error && info.phase !== "open" && (
            <p role="alert" className={cn("text-center text-sm text-danger")}>
              {phase.error}
            </p>
          )}
        </>
      )}
    </main>
  );
}
