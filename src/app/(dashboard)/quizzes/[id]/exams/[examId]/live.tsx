"use client";

import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

import { formatCountdown } from "@/engine/exam/deadline";
import { cn } from "@/lib/cn";

/** Re-fetch the page's server data every few seconds while the tab is visible. */
export function AutoRefresh({ seconds }: { seconds: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds]);
  return (
    <p className="text-xs text-fg-subtle" aria-live="off">
      Diperbarui otomatis tiap {seconds} detik.
    </p>
  );
}

// One shared one-second clock for every countdown on the page.
let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const l of listeners) l();
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

// Stable between ticks, as useSyncExternalStore requires.
function getNow() {
  if (!now) now = Date.now();
  return now;
}

/** Time left until `deadline` on this device's clock ("…" until hydrated). */
export function Remaining({ deadline }: { deadline: string }) {
  const at = useSyncExternalStore(subscribe, getNow, () => 0);
  if (!at) return <span>…</span>;
  const ms = Math.max(0, Date.parse(deadline) - at);
  return (
    <span className={cn(ms < 5 * 60_000 && "font-semibold text-warning")}>
      {ms === 0 ? "Habis" : formatCountdown(ms)}
    </span>
  );
}
