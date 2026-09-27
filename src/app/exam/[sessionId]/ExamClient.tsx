"use client";

import { useMemo } from "react";

import { ExamPlayer } from "@/components/player/exam/ExamPlayer";
import type { ExamAdapter, ExamInfo } from "@/engine/exam/types";

import {
  finishExamAction,
  joinExamAction,
  logIntegrityAction,
  saveExamAnswerAction,
  startExamAction,
  storyStepAction,
} from "../actions";

export function ExamClient({ info }: { info: ExamInfo }) {
  const adapter = useMemo<ExamAdapter>(
    () => ({
      join: (input) => joinExamAction(info.sessionId, input),
      start: startExamAction,
      save: saveExamAnswerAction,
      storyStep: storyStepAction,
      logIntegrity: logIntegrityAction,
      finish: finishExamAction,
    }),
    [info.sessionId],
  );

  return (
    <ExamPlayer
      info={info}
      adapter={adapter}
      storageKey={`quiz:exam:${info.sessionId}`}
      loginHref={`/login?${new URLSearchParams({ next: `/exam/${info.sessionId}` })}`}
    />
  );
}
