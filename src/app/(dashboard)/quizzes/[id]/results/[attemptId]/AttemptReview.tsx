"use client";

import { QuestionView } from "@/components/player/QuestionView";
import { cn } from "@/lib/cn";
import { formatResult } from "@/lib/format";
import type { QuestionType } from "@/questions/registry";
import type { ScoreResult } from "@/questions/types";

export type ReviewEntry = {
  id: string;
  type: QuestionType;
  prompt: string;
  data: unknown;
  config: unknown;
  explanation: string;
  answer: unknown;
  result: ScoreResult | null;
  points: number;
  maxPoints: number;
};

/** Every question with the participant's answer shown against the answer key (host only). */
export function AttemptReview({ entries }: { entries: ReviewEntry[] }) {
  return (
    <ol className="flex flex-col gap-4">
      {entries.map((entry, i) => {
        const state = !entry.result
          ? "skip"
          : entry.result.ratio === 1
            ? "ok"
            : entry.result.ratio > 0
              ? "partial"
              : "wrong";
        return (
          <li
            key={entry.id}
            className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5"
          >
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold">
              <span className="text-fg-subtle">Soal {i + 1}</span>
              <span
                className={cn(
                  "rounded-full px-2 py-0.5",
                  state === "ok" && "bg-success-soft text-success",
                  state === "partial" && "bg-warning-soft text-warning",
                  state === "wrong" && "bg-danger-soft text-danger",
                  state === "skip" && "bg-surface-muted text-fg-subtle",
                )}
              >
                {{ ok: "Benar", partial: "Sebagian", wrong: "Salah", skip: "Tidak dijawab" }[state]}
                {entry.result && ` · ${formatResult(entry.result)}`}
              </span>
              <span className="ml-auto text-fg-muted tabular-nums">
                {entry.points}/{entry.maxPoints} poin
              </span>
            </div>
            <QuestionView
              size="sm"
              type={entry.type}
              prompt={entry.prompt}
              data={entry.data}
              answer={entry.answer}
              disabled
              reveal={entry.config}
            >
              {entry.explanation && <p className="text-sm text-fg-muted">{entry.explanation}</p>}
            </QuestionView>
          </li>
        );
      })}
    </ol>
  );
}
