"use client";

import { useEffect, useRef, type RefObject } from "react";

import type { IntegrityEvent, IntegrityKind } from "@/engine/exam/integrity";
import type { Policy } from "@/engine/policy";

const FLUSH_MS = 10_000;
/** A window shrinking or growing by more than this share counts as a drastic resize. */
const RESIZE_SHARE = 0.3;

/**
 * Record what the exam policy asks for (docs/08-mode-exam.md#integritas) and send it in
 * batches. This prevents and records — a browser can't be locked down completely.
 */
export function useIntegrity({
  active,
  integrity,
  questionArea,
  send,
}: {
  active: boolean;
  integrity: Policy["integrity"];
  /** Copy and paste are blocked (and logged) inside this element. */
  questionArea: RefObject<HTMLElement | null>;
  send: (events: IntegrityEvent[]) => Promise<unknown>;
}) {
  const buffer = useRef<IntegrityEvent[]>([]);
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  useEffect(() => {
    if (!active) return;
    const push = (kind: IntegrityKind, durationMs?: number) =>
      buffer.current.push({
        kind,
        at: new Date().toISOString(),
        ...(durationMs !== undefined && { meta: { durationMs: Math.round(durationMs) } }),
      });
    const flush = () => {
      if (!buffer.current.length) return;
      const batch = buffer.current.splice(0, 50);
      void sendRef.current(batch);
    };
    const cleanups: (() => void)[] = [];
    const on = <K extends keyof WindowEventMap | keyof DocumentEventMap>(
      target: Window | Document | HTMLElement,
      type: K,
      handler: (e: Event) => void,
    ) => {
      target.addEventListener(type, handler);
      cleanups.push(() => target.removeEventListener(type, handler));
    };

    if (integrity.logTabSwitch) {
      let hiddenAt: number | null = null;
      on(document, "visibilitychange", () => {
        if (document.visibilityState === "hidden") hiddenAt = Date.now();
        else if (hiddenAt !== null) {
          push("tab_hidden", Date.now() - hiddenAt);
          hiddenAt = null;
        }
      });
      let last = { w: window.innerWidth, h: window.innerHeight };
      let resizeTimer: ReturnType<typeof setTimeout> | undefined;
      on(window, "resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          const now = { w: window.innerWidth, h: window.innerHeight };
          const change = Math.max(
            Math.abs(now.w - last.w) / last.w,
            Math.abs(now.h - last.h) / last.h,
          );
          // Leaving/entering fullscreen is reported on its own.
          if (change > RESIZE_SHARE && !document.fullscreenElement) push("resize");
          last = now;
        }, 500);
      });
      cleanups.push(() => clearTimeout(resizeTimer));
    }

    if (integrity.fullscreen) {
      on(document, "fullscreenchange", () => {
        if (!document.fullscreenElement) push("fullscreen_exit");
      });
    }

    const area = questionArea.current;
    if (integrity.blockCopyPaste && area) {
      for (const kind of ["copy", "cut", "paste"] as const) {
        on(area, kind, (e) => {
          e.preventDefault();
          push(kind === "paste" ? "paste" : "copy");
        });
      }
    }

    const timer = setInterval(flush, FLUSH_MS);
    on(window, "pagehide", flush);
    return () => {
      flush();
      clearInterval(timer);
      for (const off of cleanups) off();
    };
  }, [active, integrity, questionArea]);
}

/** Ask for fullscreen — must run inside the click that starts the exam. */
export function requestFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && el.requestFullscreen) {
    el.requestFullscreen().catch(() => {
      // Refused (iOS Safari, iframes): the exam still runs, exits just aren't logged.
    });
  }
}
