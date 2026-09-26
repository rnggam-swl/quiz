"use client";

import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { PracticePlayer } from "@/components/player/practice/PracticePlayer";
import type { PlayInfo, PracticeAdapter } from "@/engine/practice/types";

import {
  finishAttemptAction,
  joinSessionAction,
  startAttemptAction,
  submitAnswerAction,
} from "../actions";

export function PlayClient({ sessionId, info }: { sessionId: string; info: PlayInfo }) {
  const router = useRouter();
  const adapter = useMemo<PracticeAdapter>(
    () => ({
      join: (nickname) => joinSessionAction(sessionId, nickname),
      start: startAttemptAction,
      answer: submitAnswerAction,
      finish: finishAttemptAction,
    }),
    [sessionId],
  );

  return (
    <div className="flex min-h-dvh flex-col">
      <PracticePlayer
        info={info}
        adapter={adapter}
        storageKey={`quiz:pt:${sessionId}`}
        onExit={() => router.push("/join")}
        exitLabel="Main quiz lain"
      />
    </div>
  );
}
