"use client";

import { msUntil } from "@/engine/transport/clock";
import { cn } from "@/lib/cn";

import { useNow } from "./hooks";

/** Seconds left as a shrinking ring (the projector's question timer, P5-11). */
export function CircleTimer({
  closesAt,
  totalMs,
  offsetMs,
  paused,
  pausedRemainingMs,
  className,
}: {
  closesAt: string | null;
  totalMs: number;
  offsetMs: number;
  paused: boolean;
  pausedRemainingMs: number | null;
  className?: string;
}) {
  const now = useNow(200, !paused && !!closesAt);
  const left = paused ? (pausedRemainingMs ?? 0) : (msUntil(closesAt, offsetMs, now) ?? 0);
  const fraction = totalMs > 0 ? Math.min(1, left / totalMs) : 0;
  const seconds = Math.ceil(left / 1000);
  const r = 44;
  const circumference = 2 * Math.PI * r;
  return (
    <div
      role="timer"
      aria-label={`${seconds} detik lagi`}
      className={cn("relative inline-flex size-28 shrink-0 items-center justify-center", className)}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full -rotate-90" aria-hidden>
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-line" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className={cn(
            "transition-[stroke-dashoffset] duration-200 ease-linear",
            seconds <= 5 ? "stroke-danger" : "stroke-accent",
          )}
        />
      </svg>
      <span className="text-4xl font-bold tabular-nums">{paused ? "⏸" : seconds}</span>
    </div>
  );
}
