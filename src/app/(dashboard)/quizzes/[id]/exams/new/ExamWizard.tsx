"use client";

import { LoaderCircle, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import type { ExamForm } from "@/engine/exam/form";
import { cn } from "@/lib/cn";

import { createExamAction } from "@/app/(dashboard)/quizzes/exam-actions";

export type CompatNote = {
  number: number;
  typeLabel: string;
  level: "warn" | "unsupported";
  note: string;
};

/** A `datetime-local` value (the host's local time) as an ISO timestamp. */
function toIso(local: string): string | null {
  if (!local) return null;
  const date = new Date(local);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
    >
      <div className="flex flex-col gap-0.5">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {hint && <p className="text-sm text-fg-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Toggle({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex flex-col">
        <Label htmlFor={id} className="font-normal">
          {label}
        </Label>
        {hint && <span className="text-xs text-fg-subtle">{hint}</span>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Choices<T extends string>({
  name,
  label,
  value,
  options,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string; hint: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2 sm:grid-cols-3">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "flex cursor-pointer flex-col gap-0.5 rounded-xl border-2 p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
            value === o.value
              ? "border-accent bg-accent-soft"
              : "border-line hover:bg-surface-muted",
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          <span className="text-sm font-semibold">{o.label}</span>
          <span className="text-xs text-fg-muted">{o.hint}</span>
        </label>
      ))}
    </div>
  );
}

export function ExamWizard({
  quizId,
  defaultTitle,
  questionCount,
  tags,
  questionTags,
  compat,
}: {
  quizId: string;
  defaultTitle: string;
  questionCount: number;
  tags: { tag: string; count: number }[];
  questionTags: string[][];
  compat: CompatNote[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState(defaultTitle || "Ujian");
  const [opensAt, setOpensAt] = useState("");
  const [closesAt, setClosesAt] = useState("");
  const [duration, setDuration] = useState("60");
  const [usePool, setUsePool] = useState(false);
  const [poolSize, setPoolSize] = useState(String(Math.min(questionCount, 20)));
  const [poolTags, setPoolTags] = useState<string[]>([]);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);
  const [attempts, setAttempts] = useState(1);
  const [attemptScoring, setAttemptScoring] = useState<ExamForm["attemptScoring"]>("highest");
  const [navigation, setNavigation] = useState<ExamForm["navigation"]>("free");
  const [releaseResults, setReleaseResults] = useState<ExamForm["releaseResults"]>("after_close");
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [fullscreen, setFullscreen] = useState(true);
  const [logTabSwitch, setLogTabSwitch] = useState(true);
  const [blockCopyPaste, setBlockCopyPaste] = useState(true);
  const [access, setAccess] = useState<ExamForm["access"]>("open");
  const [passcode, setPasscode] = useState("");

  const wanted = poolTags.map((t) => t.toLowerCase());
  const candidates = wanted.length
    ? questionTags.filter((list) => list.some((t) => wanted.includes(t.toLowerCase()))).length
    : questionCount;

  function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const size = Number(poolSize);
    if (usePool && (!Number.isInteger(size) || size < 1 || size > candidates)) {
      setError(`Jumlah soal yang diambil harus antara 1 dan ${candidates}.`);
      return;
    }
    const minutes = duration.trim() ? Number(duration) : null;
    if (minutes !== null && (!Number.isInteger(minutes) || minutes < 1 || minutes > 360)) {
      setError("Durasi harus 1–360 menit, atau kosongkan untuk tanpa batas.");
      return;
    }
    const form: ExamForm = {
      title,
      opensAt: toIso(opensAt),
      closesAt: toIso(closesAt),
      durationMin: minutes,
      poolSize: usePool ? size : null,
      poolTags: usePool ? poolTags : [],
      shuffleQuestions,
      shuffleOptions,
      attempts,
      attemptScoring,
      navigation,
      releaseResults,
      showCorrectAnswer,
      fullscreen,
      logTabSwitch,
      blockCopyPaste,
      access,
      passcode,
    };
    startTransition(async () => {
      const result = await createExamAction(quizId, form).catch(() => null);
      if (!result) return setError("Koneksi bermasalah. Coba lagi.");
      if (!result.ok) return setError(result.error);
      // Roster exams need their participant list before anyone can join.
      const next = access === "roster" ? "/roster" : "";
      router.push(`/quizzes/${quizId}/exams/${result.examId}${next}`);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
      {compat.length > 0 && (
        <div
          role="note"
          className="flex gap-3 rounded-2xl border border-warning/40 bg-warning-soft p-4 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <div className="flex flex-col gap-1">
            <p className="font-medium">Beberapa soal perlu diperhatikan untuk ujian:</p>
            <ul className="list-disc pl-5 text-fg-muted">
              {compat.map((c) => (
                <li key={c.number}>
                  Soal {c.number} ({c.typeLabel}):{" "}
                  {c.level === "unsupported"
                    ? "tidak didukung di ujian."
                    : c.note || "periksa lagi."}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <Section title="Info & jadwal" hint="Di luar jadwal, peserta tidak bisa memulai.">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-title">Nama ujian</Label>
          <Input
            id="exam-title"
            value={title}
            maxLength={120}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam-opens">Dibuka</Label>
            <Input
              id="exam-opens"
              type="datetime-local"
              value={opensAt}
              onChange={(e) => setOpensAt(e.target.value)}
            />
            <span className="text-xs text-fg-subtle">Kosong = langsung dibuka</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam-closes">Ditutup</Label>
            <Input
              id="exam-closes"
              type="datetime-local"
              value={closesAt}
              onChange={(e) => setClosesAt(e.target.value)}
            />
            <span className="text-xs text-fg-subtle">Kosong = sampai kamu akhiri</span>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam-duration">Durasi (menit)</Label>
            <Input
              id="exam-duration"
              type="number"
              inputMode="numeric"
              min={1}
              max={360}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
            <span className="text-xs text-fg-subtle">Kosong = tanpa batas waktu</span>
          </div>
        </div>
        <p className="text-xs text-fg-subtle">
          Batas waktu tiap peserta = saat mulai + durasi (menurut jam server), tapi tidak melewati
          waktu tutup. Peserta yang mulai mendekati waktu tutup mendapat waktu lebih sedikit.
        </p>
      </Section>

      <Section title="Soal" hint={`${questionCount} soal di quiz ini.`}>
        <Toggle
          id="exam-pool"
          label="Ambil sebagian soal secara acak (bank soal)"
          hint="Setiap peserta mendapat kumpulan soal yang berbeda."
          checked={usePool}
          onChange={setUsePool}
        />
        {usePool && (
          <div className="flex flex-col gap-3 rounded-xl bg-surface-muted p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Label htmlFor="exam-pool-size" className="font-normal">
                Ambil
              </Label>
              <Input
                id="exam-pool-size"
                type="number"
                inputMode="numeric"
                min={1}
                max={candidates}
                className="w-24"
                value={poolSize}
                onChange={(e) => setPoolSize(e.target.value)}
              />
              <span className="text-sm">dari {candidates} soal yang cocok</span>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-sm">Hanya soal dengan tag (kosong = semua):</span>
                <div className="flex flex-wrap gap-2">
                  {tags.map(({ tag, count }) => {
                    const on = poolTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setPoolTags(on ? poolTags.filter((t) => t !== tag) : [...poolTags, tag])
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                          on
                            ? "border-accent bg-accent text-on-accent"
                            : "border-line bg-surface hover:bg-surface-muted",
                        )}
                      >
                        {tag} · {count}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
        <Toggle
          id="exam-shuffle-q"
          label="Acak urutan soal per peserta"
          checked={shuffleQuestions}
          onChange={setShuffleQuestions}
        />
        <Toggle
          id="exam-shuffle-o"
          label="Acak urutan pilihan jawaban"
          checked={shuffleOptions}
          onChange={setShuffleOptions}
        />
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Navigasi</span>
          <Choices
            name="exam-navigation"
            label="Navigasi"
            value={navigation}
            onChange={setNavigation}
            options={[
              { value: "free", label: "Bebas", hint: "Boleh kembali ke soal sebelumnya." },
              {
                value: "forward",
                label: "Maju saja",
                hint: "Soal yang dilewati tidak bisa dibuka lagi.",
              },
            ]}
          />
        </div>
      </Section>

      <Section title="Percobaan & nilai">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="exam-attempts">Kesempatan per peserta</Label>
            <Select
              id="exam-attempts"
              value={attempts}
              onChange={(e) => setAttempts(Number(e.target.value))}
            >
              <option value={1}>1 kali</option>
              <option value={2}>2 kali</option>
              <option value={3}>3 kali</option>
              <option value={5}>5 kali</option>
              <option value={0}>Tanpa batas</option>
            </Select>
          </div>
          {attempts !== 1 && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="exam-scoring">Nilai yang dipakai</Label>
              <Select
                id="exam-scoring"
                value={attemptScoring}
                onChange={(e) => setAttemptScoring(e.target.value as ExamForm["attemptScoring"])}
              >
                <option value="highest">Tertinggi</option>
                <option value="last">Terakhir</option>
                <option value="average">Rata-rata</option>
              </Select>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Rilis nilai ke peserta</span>
          <Choices
            name="exam-release"
            label="Rilis nilai ke peserta"
            value={releaseResults}
            onChange={setReleaseResults}
            options={[
              { value: "immediately", label: "Langsung", hint: "Setelah peserta submit." },
              {
                value: "after_close",
                label: "Setelah ditutup",
                hint: closesAt ? "Saat jadwal berakhir." : "Saat kamu mengakhiri ujian.",
              },
              { value: "manual", label: "Manual", hint: "Kamu yang menekan “Rilis nilai”." },
            ]}
          />
        </div>
        <Toggle
          id="exam-show-answers"
          label="Tampilkan kunci jawaban saat nilai dirilis"
          checked={showCorrectAnswer}
          onChange={setShowCorrectAnswer}
        />
      </Section>

      <Section
        title="Integritas"
        hint="Semua ini mencegah dan mencatat, bukan menjamin: browser tidak bisa dikunci sepenuhnya. Catatannya muncul di monitor dan laporan."
      >
        <Toggle
          id="exam-fullscreen"
          label="Minta layar penuh saat mulai"
          hint="Keluar dari layar penuh dicatat."
          checked={fullscreen}
          onChange={setFullscreen}
        />
        <Toggle
          id="exam-tabs"
          label="Catat pindah tab / aplikasi"
          checked={logTabSwitch}
          onChange={setLogTabSwitch}
        />
        <Toggle
          id="exam-copy"
          label="Blokir salin-tempel di area soal"
          hint="Percobaan menyalin atau menempel dicatat."
          checked={blockCopyPaste}
          onChange={setBlockCopyPaste}
        />
      </Section>

      <Section title="Akses">
        <Choices
          name="exam-access"
          label="Akses"
          value={access}
          onChange={setAccess}
          options={[
            { value: "open", label: "Siapa saja", hint: "Cukup kode/link dan nama." },
            { value: "login", label: "Wajib masuk", hint: "Peserta masuk dengan akunnya." },
            {
              value: "roster",
              label: "Daftar peserta",
              hint: "Hanya NIS/email yang kamu impor.",
            },
          ]}
        />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="exam-passcode">Kode akses tambahan (opsional)</Label>
          <Input
            id="exam-passcode"
            value={passcode}
            maxLength={40}
            autoComplete="off"
            placeholder="mis. IPA8B"
            onChange={(e) => setPasscode(e.target.value)}
          />
          <span className="text-xs text-fg-subtle">
            Diberikan di kelas, supaya link yang tersebar tidak cukup untuk ikut.
          </span>
        </div>
      </Section>

      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          Batal
        </Button>
        <Button type="submit" disabled={pending}>
          {pending && <LoaderCircle className="animate-spin" />} Buat ujian
        </Button>
      </div>
    </form>
  );
}
