"use client";

import { useState } from "react";

import { PracticePlayer } from "@/components/player/practice/PracticePlayer";
import { DEFAULT_POLICIES } from "@/engine/policy";
import { createLocalPracticeAdapter } from "@/engine/practice/local";
import { snapshotFromDraft } from "@/engine/practice/snapshot";
import type { PlayInfo } from "@/engine/practice/types";

import { sampleQuiz, type SampleSet } from "../sample";

export function PlaygroundPlay({
  feedback,
  attempts,
  latencyMs,
  set,
}: {
  feedback: "instant" | "end";
  attempts: number;
  latencyMs: number;
  set: SampleSet;
}) {
  const [{ adapter, info }] = useState(() => {
    const { quiz, questions } = sampleQuiz(set);
    const snapshot = snapshotFromDraft(quiz, questions);
    const policy = { ...DEFAULT_POLICIES.practice, feedback, attempts };
    const info: PlayInfo = {
      title: quiz.title,
      description: quiz.description,
      coverUrl: quiz.coverUrl,
      theme: quiz.theme,
      questionCount: snapshot.questions.length,
      policy: { feedback, gamification: true, showCorrectAnswer: true, attempts },
    };
    return { adapter: createLocalPracticeAdapter(snapshot, policy, { latencyMs }), info };
  });

  return (
    <div className="flex min-h-dvh flex-col">
      <PracticePlayer info={info} adapter={adapter} storageKey={null} />
    </div>
  );
}
