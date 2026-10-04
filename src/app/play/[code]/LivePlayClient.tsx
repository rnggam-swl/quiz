"use client";

import { useMemo } from "react";

import { LivePlayer } from "@/components/live/LivePlayer";
import type { GameMode, LivePlayerAdapter } from "@/engine/live/types";
import type { LivePublicKey } from "@/engine/transport/signing";
import { openSupabaseChannel } from "@/engine/transport/supabase";

import {
  answerLiveAction,
  buzzLiveAction,
  chooseTeamAction,
  joinLiveAction,
  liveStateAction,
} from "../live-actions";

export function LivePlayClient({
  sessionId,
  title,
  mode,
  publicKey,
}: {
  sessionId: string;
  title: string;
  mode: GameMode;
  publicKey: LivePublicKey;
}) {
  const adapter = useMemo<LivePlayerAdapter>(
    () => ({
      join: (nickname) => joinLiveAction(sessionId, nickname),
      state: liveStateAction,
      answer: answerLiveAction,
      buzz: buzzLiveAction,
      chooseTeam: chooseTeamAction,
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
      mode={mode}
    />
  );
}
