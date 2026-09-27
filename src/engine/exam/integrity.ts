import { z } from "zod";

/**
 * Integrity events (docs/08-mode-exam.md#integritas): they prevent and record,
 * they don't guarantee. Kinds match the check constraint on integrity_events.
 */
export const INTEGRITY_KINDS = [
  "tab_hidden",
  "fullscreen_exit",
  "copy",
  "paste",
  "resize",
  "multi_device",
] as const;
export type IntegrityKind = (typeof INTEGRITY_KINDS)[number];

export const MAX_EVENT_BATCH = 50;

/** One event as the browser reports it; validated again before it reaches the database. */
export const integrityEventSchema = z.object({
  kind: z.enum(INTEGRITY_KINDS),
  at: z.iso.datetime(),
  meta: z
    .object({ durationMs: z.number().int().min(0).max(86_400_000).optional() })
    .strict()
    .optional(),
});
export type IntegrityEvent = z.infer<typeof integrityEventSchema>;

export const integrityBatchSchema = z.array(integrityEventSchema).max(MAX_EVENT_BATCH);

const LABELS: Record<IntegrityKind, string> = {
  tab_hidden: "Pindah tab",
  fullscreen_exit: "Keluar layar penuh",
  copy: "Menyalin",
  paste: "Menempel",
  resize: "Ubah ukuran jendela",
  multi_device: "Perangkat lain",
};

/** "1m 20d", "45d". */
function shortDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${s % 60}d` : `${s}d`;
}

export type IntegritySummary = { kind: IntegrityKind; count: number; totalMs: number }[];

/** Count per kind (and total time away for tab switches), most frequent first. */
export function summarizeIntegrity(
  events: { kind: string; meta?: { durationMs?: number } | null }[],
): IntegritySummary {
  const byKind = new Map<IntegrityKind, { count: number; totalMs: number }>();
  for (const e of events) {
    if (!(INTEGRITY_KINDS as readonly string[]).includes(e.kind)) continue;
    const entry = byKind.get(e.kind as IntegrityKind) ?? { count: 0, totalMs: 0 };
    entry.count++;
    entry.totalMs += e.meta?.durationMs ?? 0;
    byKind.set(e.kind as IntegrityKind, entry);
  }
  return [...byKind]
    .map(([kind, v]) => ({ kind, ...v }))
    .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind));
}

/** "Pindah tab 4× (1m 20d) · Menempel 1×" — or "" when nothing happened. */
export function describeIntegrity(summary: IntegritySummary): string {
  return summary
    .map(
      ({ kind, count, totalMs }) =>
        `${LABELS[kind]} ${count}×${kind === "tab_hidden" && totalMs > 0 ? ` (${shortDuration(totalMs)})` : ""}`,
    )
    .join(" · ");
}
