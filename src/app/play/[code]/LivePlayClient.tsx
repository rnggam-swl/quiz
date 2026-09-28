"use client";

import { useMemo } from "react";

import { LivePlayer } from "@/components/live/LivePlayer";
import type { LivePlayerAdapter } from "@/engine/live/types";
import type { LivePublicKey } from "@/engine/transport/signing";
import { openSupabaseChannel } from "@/engine/transport/supabase";

import { answerLiveAction, joinLiveAction, liveStateAction } from "../live-actions";

export function LivePlayClient({
  sessionId,
  title,
  publicKey,
}: {
  sessionId: string;
  title: string;
  publicKey: LivePublicKey;
}) {
  const adapter = useMemo<LivePlayerAdapter>(
    () => ({
      join: (nickname) => joinLiveAction(sessionId, nickname),
      state: liveStateAction,
      answer: answerLiveAction,
    }),
    [sessionId],
  );
  return (
    <LivePlayer
      sessionId={sessionId}
      title={title}
      adapter={adapter}
      openChannel={openSupabaseChannel}
      storageKey={`quiz:live:${sessionId}`}
      publicKey={publicKey}
    />
  );
}
