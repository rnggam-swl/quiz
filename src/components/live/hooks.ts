"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { LivePhase } from "@/engine/live/types";
import type { PlayError, Result } from "@/engine/practice/types";
import { measureClockOffset } from "@/engine/transport/clock";
import type { ChannelStatus, LiveEvent, SessionChannel } from "@/engine/transport/types";

// ─── Clock ─────────────────────────────────────────────────────────────────────

let offsetPromise: Promise<number> | null = null;

async function pingServer(): Promise<number> {
  const response = await fetch("/api/time", { cache: "no-store" });
  const { now } = (await response.json()) as { now: number };
  if (typeof now !== "number") throw new Error("bad time");
  return now;
}

/**
 * How far the server clock is ahead of this device (P5-03), measured once per page
 * with a few pings. 0 until measured, or when `measure` is off (local engine).
 */
export function useServerOffset(measure = true): number {
  const [offset, setOffset] = useState(0);
  useEffect(() => {
    if (!measure) return;
    let cancelled = false;
    offsetPromise ??= measureClockOffset(pingServer);
    void offsetPromise.then((value) => {
      if (!cancelled) setOffset(value);
    });
    return () => {
      cancelled = true;
    };
  }, [measure]);
  return offset;
}

/** Date.now(), refreshed every `intervalMs` while `active`. */
export function useNow(intervalMs: number, active = true): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs, active]);
  return now;
}

// ─── State ─────────────────────────────────────────────────────────────────────

type Versioned = { version: number; phase: LivePhase; phaseClosesAt: string | null };

/**
 * A live screen's state (P5-04): fetched on mount, and again whenever the channel says
 * the version moved, after a reconnect, when the tab comes back, shortly after a phase
 * timer ends (in case its event got lost), and on a poll (`pollMs`, e.g. the host's
 * answer counter). Fetches never overlap; an older answer never replaces a newer one.
 */
export function useLiveState<V extends Versioned>({
  fetchState,
  channel,
  pollMs,
  onError,
  fromEvent,
}: {
  fetchState: () => Promise<Result<{ view: V }>>;
  /**
   * The new view carried by an event (verified signed state), or null to fetch it.
   * Without it, every event is only a hint.
   */
  fromEvent?: (event: LiveEvent, current: V | null) => Promise<V | null>;
  channel: SessionChannel | null;
  pollMs: (view: V | null, connected: boolean) => number | null;
  onError?: (error: PlayError) => void;
}) {
  const [view, setViewState] = useState<V | null>(null);
  const [connected, setConnected] = useState(true);
  const viewRef = useRef<V | null>(null);
  const inFlight = useRef(false);
  const again = useRef(false);
  const fetchRef = useRef(fetchState);
  const errorRef = useRef(onError);
  const fromEventRef = useRef(fromEvent);
  useEffect(() => {
    fetchRef.current = fetchState;
    errorRef.current = onError;
    fromEventRef.current = fromEvent;
  }, [fetchState, onError, fromEvent]);

  const setView = useCallback((next: V) => {
    const current = viewRef.current;
    if (current && next.version < current.version) return;
    viewRef.current = next;
    setViewState(next);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      do {
        again.current = false;
        const result = await fetchRef.current().catch(() => null);
        if (result?.ok) setView(result.view);
        else errorRef.current?.(result?.error ?? "network");
      } while (again.current);
    } finally {
      inFlight.current = false;
    }
  }, [setView]);

  // First load, events, reconnects.
  useEffect(() => {
    void refresh();
    if (!channel) return;
    let wasDown = false;
    const offEvent = channel.onEvent(async (event) => {
      const current = viewRef.current;
      if (current && event.version <= current.version) return;
      const carried = await fromEventRef.current?.(event, current).catch(() => null);
      if (carried) setView(carried);
      else void refresh();
    });
    const offStatus = channel.onStatus((status: ChannelStatus) => {
      setConnected(status === "connected");
      if (status === "disconnected") wasDown = true;
      if (status === "connected" && wasDown) {
        wasDown = false;
        void refresh();
      }
    });
    return () => {
      offEvent();
      offStatus();
    };
  }, [channel, refresh, setView]);

  // Back to the tab (phones lock their screens all the time).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // Polling, and a catch-up fetch a little after a phase timer ends.
  const interval = pollMs(view, connected);
  const closesAt = view?.phaseClosesAt ?? null;
  useEffect(() => {
    if (!interval) return;
    const timer = setInterval(() => void refresh(), interval);
    return () => clearInterval(timer);
  }, [interval, refresh]);
  useEffect(() => {
    if (!closesAt) return;
    // Spread over two seconds so a room full of phones doesn't fetch in the same instant.
    const ms = Date.parse(closesAt) - Date.now() + 2500 + Math.random() * 2000;
    if (ms <= 0 || ms > 15 * 60_000) return;
    const timer = setTimeout(() => void refresh(), ms);
    return () => clearTimeout(timer);
  }, [closesAt, refresh]);

  return { view, setView, refresh, connected };
}

/** The channel of a session for the lifetime of the component. */
export function useChannel(
  open: ((sessionId: string, presenceKey?: string) => SessionChannel) | null,
  sessionId: string | null,
  presenceKey?: string,
): SessionChannel | null {
  const [channel, setChannel] = useState<SessionChannel | null>(null);
  useEffect(() => {
    if (!open || !sessionId) return;
    const opened = open(sessionId, presenceKey);
    const timer = setTimeout(() => setChannel(opened), 0);
    return () => {
      clearTimeout(timer);
      opened.close();
      setChannel(null);
    };
  }, [open, sessionId, presenceKey]);
  return channel;
}
