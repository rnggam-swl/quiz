"use client";

import { useState } from "react";

import { ExamPlayer } from "@/components/player/exam/ExamPlayer";
import { createLocalExamAdapter } from "@/engine/exam/local";
import type { ExamInfo } from "@/engine/exam/types";
import { DEFAULT_POLICIES, type Policy } from "@/engine/policy";
import { snapshotFromDraft } from "@/engine/practice/snapshot";

import { sampleQuiz } from "../sample";

export function PlaygroundExam({
  durationS,
  navigation,
  access,
  passcode,
  release,
  fullscreen,
}: {
  durationS: number;
  navigation: Policy["navigation"];
  access: "open" | "roster";
  passcode?: string;
  release: Policy["releaseResults"];
  fullscreen: boolean;
}) {
  const [{ adapter, info }] = useState(() => {
    const { quiz, questions } = sampleQuiz("exam");
    const snapshot = snapshotFromDraft(quiz, questions);
    const policy: Policy = {
      ...DEFAULT_POLICIES.exam,
      timer: { totalS: Math.max(60, durationS) },
      navigation,
      access,
      ...(passcode && { passcode }),
      releaseResults: release,
      showCorrectAnswer: true,
      integrity: { fullscreen, logTabSwitch: true, blockCopyPaste: true },
    };
    const info: ExamInfo = {
      sessionId: "playground-exam",
      title: "Ujian Pengetahuan Umum (demo)",
      quizTitle: quiz.title,
      description: "Latihan tampilan ujian tanpa database.",
      questionCount: snapshot.questions.length,
      durationS: policy.timer.totalS ?? null,
      opensAt: null,
      closesAt: null,
      phase: "open",
      access,
      needsPasscode: !!passcode,
      navigation,
      integrity: policy.integrity,
      attempts: policy.attempts,
      releaseResults: release,
      serverNow: new Date().toISOString(),
    };
    const adapter = createLocalExamAdapter(snapshot, policy, {
      roster: [
        { name: "Ani Wijaya", identifier: "1001" },
        { name: "Budi Santoso", identifier: "1002" },
      ],
      onIntegrity: (events) => console.info("[integrity]", events),
    });
    return { adapter, info };
  });

  return <ExamPlayer info={info} adapter={adapter} storageKey={null} />;
}
