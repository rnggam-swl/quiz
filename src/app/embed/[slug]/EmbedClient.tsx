"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { PracticePlayer, type PlayerEvent } from "@/components/player/practice/PracticePlayer";
import type { PlayInfo, PracticeAdapter } from "@/engine/practice/types";
import type { EmbedClaims } from "@/lib/embed-token";
import {
  detectParentOrigin,
  EMBED_SOURCE,
  parseHostMessage,
  type EmbedToHost,
} from "@/lib/embed-protocol";

import {
  finishAttemptAction,
  joinSessionAction,
  startAttemptAction,
  submitAnswerAction,
} from "../../play/actions";

export function EmbedClient({
  slug,
  sessionId,
  info,
  allowedOrigins,
  embedToken,
  identity,
  theme,
}: {
  slug: string;
  sessionId: string;
  info: PlayInfo;
  allowedOrigins: string[];
  embedToken: string | null;
  identity: EmbedClaims | null;
  theme: "light" | "dark" | null;
}) {
  // Who embeds us? Only talk to allowed origins. (Not rendered, so SSR's null is harmless.)
  const [parentOrigin] = useState<string | null>(() =>
    typeof window === "undefined"
      ? null
      : detectParentOrigin(
          allowedOrigins,
          Array.from(window.location.ancestorOrigins ?? []),
          document.referrer,
        ),
  );
  const [primary, setPrimary] = useState<string | undefined>();
  const [runKey, setRunKey] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  // Separate tokens per embedded learner, so a shared device doesn't mix people up.
  const storageKey = `quiz:pt:${sessionId}:${identity?.externalId ?? "guest"}`;

  const post = useCallback(
    (message: EmbedToHost) => {
      if (!parentOrigin || window.parent === window) return;
      window.parent.postMessage({ source: EMBED_SOURCE, ...message }, parentOrigin);
    },
    [parentOrigin],
  );

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!parentOrigin) return;
    post({ type: "ready", payload: { slug, title: info.title } });

    // Report our natural height so the host can size the iframe (no inner scrollbar).
    const el = root.current;
    let last = 0;
    const observer = new ResizeObserver(() => {
      const height = Math.ceil(el?.getBoundingClientRect().height ?? 0);
      if (height && height !== last) {
        last = height;
        post({ type: "resize", payload: { height } });
      }
    });
    if (el) observer.observe(el);

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== parentOrigin) return;
      const message = parseHostMessage(event.data);
      if (message?.type === "setTheme") {
        if (message.payload.primary) setPrimary(message.payload.primary);
        if (message.payload.mode) document.documentElement.dataset.theme = message.payload.mode;
      } else if (message?.type === "restart") {
        try {
          localStorage.removeItem(storageKey);
        } catch {
          // ignore
        }
        setRunKey((k) => k + 1);
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      observer.disconnect();
      window.removeEventListener("message", onMessage);
    };
  }, [info.title, parentOrigin, post, slug, storageKey]);

  const adapter = useMemo<PracticeAdapter>(
    () => ({
      join: (nickname) => joinSessionAction(sessionId, nickname, embedToken),
      start: startAttemptAction,
      answer: submitAnswerAction,
      finish: finishAttemptAction,
    }),
    [embedToken, sessionId],
  );

  const onEvent = useCallback(
    (event: PlayerEvent) => {
      if (event.type === "started")
        post({ type: "started", payload: { attemptId: event.attemptId } });
      else if (event.type === "answered") {
        const { questionIndex, correct, total } = event;
        post({ type: "answered", payload: { questionIndex, correct, total } });
      } else {
        const { attemptId, score, maxScore, ratio, durationMs } = event;
        post({ type: "completed", payload: { attemptId, score, maxScore, ratio, durationMs } });
      }
    },
    [post],
  );

  const playInfo = useMemo(
    () => (primary ? { ...info, theme: { ...info.theme, primary } } : info),
    [info, primary],
  );

  return (
    // Natural height (no min-h-dvh), so the reported size shrinks as well as grows.
    <div ref={root} className="flex flex-col">
      <PracticePlayer
        key={runKey}
        info={playInfo}
        adapter={adapter}
        storageKey={storageKey}
        autoJoinAs={identity?.name ?? undefined}
        onEvent={onEvent}
        className="min-h-[480px]"
      />
    </div>
  );
}
