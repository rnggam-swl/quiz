import { Flag } from "lucide-react";

import type { ItemStat } from "@/engine/exam/report";
import { cn } from "@/lib/cn";

const seconds = (ms: number | null) => (ms === null ? "–" : `${Math.round(ms / 1000)} dtk`);

/** Item analysis cards: % correct, answers, time, and how often each option was picked. */
export function ItemAnalysis({ items }: { items: ItemStat[] }) {
  return (
    <ol className="flex flex-col gap-2">
      {items.map((item) => (
        <li
          key={item.questionId}
          className={cn(
            "flex flex-col gap-3 rounded-2xl border bg-surface p-4 shadow-card",
            item.flagged ? "border-danger/40" : "border-line",
          )}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex items-center gap-2 text-xs text-fg-subtle">
                Soal {item.number} · {item.typeLabel}
                {item.flagged && (
                  <span className="inline-flex items-center gap-1 font-medium text-danger">
                    <Flag className="size-3.5" /> Perlu dicek
                  </span>
                )}
              </span>
              <p className="line-clamp-2 text-sm font-medium">{item.prompt || "(tanpa teks)"}</p>
            </div>
            <dl className="flex gap-5 text-sm">
              <div>
                <dt className="text-xs text-fg-subtle">Benar</dt>
                <dd className={cn("font-semibold tabular-nums", item.flagged && "text-danger")}>
                  {item.percentCorrect === null ? "–" : `${item.percentCorrect}%`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Dijawab</dt>
                <dd className="font-semibold tabular-nums">{item.answered}</dd>
              </div>
              <div>
                <dt className="text-xs text-fg-subtle">Rata-rata waktu</dt>
                <dd className="font-semibold tabular-nums">{seconds(item.avgTimeMs)}</dd>
              </div>
              {item.pending > 0 && (
                <div>
                  <dt className="text-xs text-fg-subtle">Belum dinilai</dt>
                  <dd className="font-semibold text-warning tabular-nums">{item.pending}</dd>
                </div>
              )}
            </dl>
          </div>
          {item.options && item.answered > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Distribusi pilihan">
              {item.options.map((o, i) => {
                const share = Math.round((o.count / item.answered) * 100);
                return (
                  <li
                    key={i}
                    className="grid grid-cols-[minmax(0,1fr)_8rem_3rem] items-center gap-3 text-xs"
                  >
                    <span className={cn("truncate", o.correct && "font-semibold text-success")}>
                      {o.correct && "✓ "}
                      {o.label}
                    </span>
                    <span className="h-2 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
                      <span
                        className={cn("block h-full", o.correct ? "bg-success" : "bg-line-strong")}
                        style={{ width: `${share}%` }}
                      />
                    </span>
                    <span className="text-right tabular-nums">
                      {o.count} ({share}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      ))}
    </ol>
  );
}
