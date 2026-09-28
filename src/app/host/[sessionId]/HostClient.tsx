"use client";

import { useMemo } from "react";

import { HostScreen } from "@/components/live/HostScreen";
import type { LiveHostAdapter } from "@/engine/live/types";
import { openSupabaseChannel } from "@/engine/transport/supabase";

import {
  advanceLiveAction,
  hostLiveStateAction,
  kickParticipantAction,
  liveSettingsAction,
} from "../actions";

export function HostClient({
  sessionId,
  joinUrl,
  reportHref,
}: {
  sessionId: string;
  joinUrl: string;
  reportHref: string;
}) {
  const adapter = useMemo<LiveHostAdapter>(
    () => ({
      state: () => hostLiveStateAction(sessionId),
      advance: (version, action) => advanceLiveAction(sessionId, version, action),
      settings: (patch) => liveSettingsAction(sessionId, patch),
      kick: (participantId) => kickParticipantAction(sessionId, participantId),
    }),
    [sessionId],
  );
  return (
    <HostScreen
      sessionId={sessionId}
      adapter={adapter}
      openChannel={openSupabaseChannel}
      joinUrl={joinUrl}
      reportHref={reportHref}
    />
  );
}
