"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Result } from "@/engine/practice/types";

export type SaveStatus = "saved" | "saving" | "offline" | "closed";

type Pending = { answer: unknown; timeMs: number };
type Save = (questionId: string, answer: unknown, timeMs: number) => Promise<Result<object>>;

const RETRY_MS = 5000;

function readQueue(key: string | null): Record<string, Pending> {
  if (!key || typeof localStorage === "undefined") return {};
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, Pending>) : {};
  } catch {
    return {};
  }
}

/**
 * Autosave with an offline queue (docs/08-mode-exam.md#autosave--melanjutkan): the latest
 * answer per question waits here — and in localStorage, so a reload doesn't lose it —
 * until the server confirms it. Saves are sent one at a time, retried every few seconds
 * and whenever the browser comes back online.
 */
export function useSaveQueue(storageKey: string | null, save: Save) {
  // Answers a previous page load couldn't send (the shell mounts per attempt).
  const [restored] = useState(() => readQueue(storageKey));
  const queue = useRef<Record<string, Pending>>(restored);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [pendingCount, setPendingCount] = useState(() => Object.keys(restored).length);
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  const persist = useCallback(() => {
    setPendingCount(Object.keys(queue.current).length);
    if (!storageKey) return;
    try {
      if (Object.keys(queue.current).length) {
        localStorage.setItem(storageKey, JSON.stringify(queue.current));
      } else localStorage.removeItem(storageKey);
    } catch {
      // Private mode or full storage: the in-memory queue still works.
    }
  }, [storageKey]);

  /** Send everything queued. Resolves true when the queue is empty. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    try {
      for (;;) {
        const [questionId, pending] = Object.entries(queue.current)[0] ?? [];
        if (!questionId || !pending) break;
        setStatus("saving");
        const result = await saveRef
          .current(questionId, pending.answer, pending.timeMs)
          .catch(() => ({ ok: false, error: "network" }) as const);
        if (!result.ok && result.error === "network") {
          setStatus("offline");
          return false;
        }
        if (
          !result.ok &&
          (result.error === "deadline_passed" || result.error === "attempt_closed")
        ) {
          setStatus("closed");
          return false;
        }
        // Saved, or refused for good (invalid): either way it leaves the queue —
        // unless the participant changed the answer again meanwhile.
        if (queue.current[questionId] === pending) {
          delete queue.current[questionId];
          persist();
        }
      }
      setStatus("saved");
      return true;
    } finally {
      inFlight.current = false;
    }
  }, [persist]);

  const enqueue = useCallback(
    (questionId: string, answer: unknown, timeMs: number) => {
      queue.current = { ...queue.current, [questionId]: { answer, timeMs } };
      persist();
      setStatus("saving");
    },
    [persist],
  );

  useEffect(() => {
    const retry = () => {
      if (Object.keys(queue.current).length) void flush();
    };
    const first = setTimeout(retry, 0);
    const timer = setInterval(retry, RETRY_MS);
    window.addEventListener("online", retry);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener("online", retry);
    };
  }, [flush]);

  return { enqueue, flush, status, pendingCount };
}
