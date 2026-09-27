"use client";

import { ChevronLeft, ChevronRight, CircleCheck, LoaderCircle } from "lucide-react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { countWords, rubricRatio, type EssayConfig } from "@/questions/essay/definition";

import { gradeResponseAction } from "@/app/(dashboard)/quizzes/exam-actions";

export type GradingItem = {
  responseId: string;
  participant: string;
  attemptNo: number;
  text: string;
  graded: boolean;
  /** 0..1 once graded. */
  ratio: number | null;
  points: number;
  feedback: string;
  rubricScores: Record<string, number>;
};

function ScorePicker({
  id,
  max,
  value,
  onChange,
}: {
  id: string;
  max: number;
  value: number | null;
  onChange: (value: number) => void;
}) {
  // Small scales as buttons (one tap each); larger ones as a number field.
  if (max <= 10) {
    return (
      <div role="radiogroup" aria-labelledby={id} className="flex flex-wrap gap-1">
        {Array.from({ length: max + 1 }, (_, n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "size-9 rounded-lg border text-sm font-semibold tabular-nums transition-colors",
              value === n
                ? "border-accent bg-accent text-on-accent"
                : "border-line bg-surface hover:bg-surface-muted",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }
  return (
    <Input
      aria-labelledby={id}
      type="number"
      inputMode="numeric"
      min={0}
      max={max}
      className="w-24"
      value={value ?? ""}
      onChange={(e) => onChange(Math.min(max, Math.max(0, Math.round(Number(e.target.value)))))}
    />
  );
}

function GradeForm({
  examId,
  item,
  config,
  points,
  onSaved,
}: {
  examId: string;
  item: GradingItem;
  config: EssayConfig;
  points: number;
  onSaved: () => void;
}) {
  const hasRubric = config.rubric.length > 0;
  const [scores, setScores] = useState<Record<string, number>>(item.rubricScores);
  const [percent, setPercent] = useState<string>(
    item.ratio === null ? "" : String(Math.round(item.ratio * 100)),
  );
  const [feedback, setFeedback] = useState(item.feedback);
  const [pending, startTransition] = useTransition();

  const complete = hasRubric
    ? config.rubric.every((r) => scores[r.id] !== undefined)
    : percent.trim() !== "" && Number(percent) >= 0 && Number(percent) <= 100;
  const ratio = hasRubric ? (rubricRatio(config.rubric, scores) ?? 0) : Number(percent) / 100;
  const words = countWords(item.text);

  function save() {
    startTransition(async () => {
      const result = await gradeResponseAction(examId, item.responseId, {
        ...(hasRubric ? { rubric: scores } : { percent: Number(percent) }),
        feedback,
      }).catch(() => null);
      if (!result) return void toast.error("Koneksi bermasalah. Coba lagi.");
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Nilai ${item.participant} disimpan: ${result.points}/${points} poin.`);
      onSaved();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <article className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <header className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">
            {item.participant}
            {item.attemptNo > 1 && (
              <span className="ml-2 text-xs font-normal text-fg-subtle">
                percobaan #{item.attemptNo}
              </span>
            )}
          </h3>
          <span
            className={cn(
              "text-xs tabular-nums",
              (config.minWords && words < config.minWords) ||
                (config.maxWords && words > config.maxWords)
                ? "text-warning"
                : "text-fg-subtle",
            )}
          >
            {words} kata
            {config.minWords && ` · min ${config.minWords}`}
            {config.maxWords && ` · maks ${config.maxWords}`}
          </span>
        </header>
        {item.text.trim() ? (
          <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{item.text}</p>
        ) : (
          <p className="text-sm text-fg-subtle italic">(Jawaban kosong)</p>
        )}
      </article>

      <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
        {hasRubric ? (
          config.rubric.map((r, i) => (
            <div key={r.id} className="flex flex-col gap-1.5">
              <span id={`crit-${r.id}`} className="text-sm font-medium">
                {r.criterion.trim() || `Kriteria ${i + 1}`}{" "}
                <span className="font-normal text-fg-subtle">(0–{r.points})</span>
              </span>
              <ScorePicker
                id={`crit-${r.id}`}
                max={r.points}
                value={scores[r.id] ?? null}
                onChange={(v) => setScores({ ...scores, [r.id]: v })}
              />
            </div>
          ))
        ) : (
          <div className="flex items-center gap-2">
            <Label htmlFor={`percent-${item.responseId}`}>Nilai</Label>
            <Input
              id={`percent-${item.responseId}`}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              className="w-24"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
            <span className="text-sm">%</span>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`feedback-${item.responseId}`}>Komentar untuk peserta (opsional)</Label>
          <Textarea
            id={`feedback-${item.responseId}`}
            value={feedback}
            maxLength={2000}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-sm text-fg-muted tabular-nums">
            {complete ? `= ${Math.round(points * ratio)} dari ${points} poin` : "Lengkapi nilai"}
          </span>
          <Button onClick={save} disabled={!complete || pending}>
            {pending && <LoaderCircle className="animate-spin" />}
            {item.graded ? "Perbarui nilai" : "Simpan & lanjut"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** One essay question's answers, one at a time (P4-11). */
export function GradingQueue({
  examId,
  number,
  prompt,
  points,
  config,
  items,
}: {
  examId: string;
  number: number;
  prompt: string;
  points: number;
  config: EssayConfig;
  items: GradingItem[];
}) {
  // Keep the first order while grading: the server re-sorts after each save.
  const [order] = useState(() => items.map((i) => i.responseId));
  const ids = [...order, ...items.map((i) => i.responseId).filter((id) => !order.includes(id))];
  const byId = new Map(items.map((i) => [i.responseId, i]));
  const list = ids.map((id) => byId.get(id)).filter((i): i is GradingItem => !!i);
  const [index, setIndex] = useState(0);
  const current = list[Math.min(index, list.length - 1)];
  const graded = list.filter((i) => i.graded).length;

  function next() {
    // The next one still waiting, after this one (wrapping around).
    for (let step = 1; step <= list.length; step++) {
      const i = (index + step) % list.length;
      const item = list[i]!;
      if (!item.graded && item.responseId !== current?.responseId) return setIndex(i);
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">
          Soal {number} <span className="font-normal text-fg-subtle">· {points} poin</span>
        </h2>
        <p className="text-sm whitespace-pre-wrap">{prompt}</p>
        {config.guide.trim() && (
          <details className="rounded-xl bg-surface-muted px-4 py-2 text-sm">
            <summary className="cursor-pointer font-medium">Panduan penilaian</summary>
            <p className="mt-2 whitespace-pre-wrap text-fg-muted">{config.guide}</p>
          </details>
        )}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line-strong p-10 text-center text-fg-muted">
          Belum ada jawaban yang dikumpulkan untuk soal ini.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-sm text-fg-muted">
              {graded === list.length && <CircleCheck className="size-4 text-success" />}
              {graded} dari {list.length} sudah dinilai
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Jawaban sebelumnya"
                disabled={index === 0}
                onClick={() => setIndex(index - 1)}
              >
                <ChevronLeft />
              </Button>
              <span className="text-sm tabular-nums">
                {index + 1} / {list.length}
              </span>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Jawaban berikutnya"
                disabled={index >= list.length - 1}
                onClick={() => setIndex(index + 1)}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
          {current && (
            <GradeForm
              key={current.responseId}
              examId={examId}
              item={current}
              config={config}
              points={points}
              onSaved={next}
            />
          )}
        </>
      )}
    </div>
  );
}
