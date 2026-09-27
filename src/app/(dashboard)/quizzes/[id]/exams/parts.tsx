import type { ReactNode } from "react";

import { LocalTime } from "@/components/ui/LocalTime";
import type { ExamPhase } from "@/engine/exam/types";
import { cn } from "@/lib/cn";

// Small pieces shared by the host's exam pages.

const PHASES: Record<ExamPhase, { label: string; tone: string }> = {
  upcoming: { label: "Terjadwal", tone: "bg-accent-soft text-accent-fg" },
  open: { label: "Berlangsung", tone: "bg-success-soft text-success" },
  closed: { label: "Ditutup", tone: "bg-surface-muted text-fg-muted" },
};

export const ATTEMPT_STATUS = {
  not_started: { label: "Belum mulai", tone: "bg-surface-muted text-fg-muted" },
  in_progress: { label: "Mengerjakan", tone: "bg-accent-soft text-accent-fg" },
  submitted: { label: "Selesai", tone: "bg-success-soft text-success" },
  expired: { label: "Waktu habis", tone: "bg-warning-soft text-warning" },
} as const;

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", tone)}>
      {children}
    </span>
  );
}

export function PhaseBadge({ phase }: { phase: ExamPhase }) {
  return <Badge tone={PHASES[phase].tone}>{PHASES[phase].label}</Badge>;
}

/** "27 Sep 2026 08.00 – 27 Sep 2026 10.00" in the viewer's time zone, or what's missing. */
export function ExamWindow({
  opensAt,
  closesAt,
}: {
  opensAt: string | null;
  closesAt: string | null;
}) {
  if (!opensAt && !closesAt) return <>Dibuka sampai diakhiri guru</>;
  if (!closesAt) {
    return (
      <>
        Mulai <LocalTime iso={opensAt!} />
      </>
    );
  }
  if (!opensAt) {
    return (
      <>
        Sampai <LocalTime iso={closesAt} />
      </>
    );
  }
  return (
    <>
      <LocalTime iso={opensAt} /> – <LocalTime iso={closesAt} />
    </>
  );
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 shadow-card">
      <dt className="text-sm text-fg-subtle">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
