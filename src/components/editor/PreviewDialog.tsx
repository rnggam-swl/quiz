"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";

import { PracticePlayer } from "@/components/player/practice/PracticePlayer";
import { Button } from "@/components/ui/Button";
import { DEFAULT_POLICIES } from "@/engine/policy";
import { createLocalPracticeAdapter } from "@/engine/practice/local";
import { snapshotFromDraft } from "@/engine/practice/snapshot";
import type { PlayInfo } from "@/engine/practice/types";
import type { Question } from "@/questions/question";

import type { QuizDraft } from "./types";

/**
 * Plays the current draft exactly like a participant would (practice mode),
 * with the same player and engine. Scoring runs in the browser here only
 * because nothing is saved — real sessions score on the server (docs/02).
 */
export function PreviewDialog({
  open,
  onOpenChange,
  quiz,
  questions,
  startIndex = 0,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  quiz: QuizDraft;
  questions: Question[];
  startIndex?: number;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-canvas focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Pratinjau quiz</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            Mainkan quiz seperti peserta. Jawaban tidak disimpan.
          </DialogPrimitive.Description>
          {open && (
            <PreviewRun
              quiz={quiz}
              questions={questions}
              startIndex={startIndex}
              onClose={() => onOpenChange(false)}
            />
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PreviewRun({
  quiz,
  questions,
  startIndex,
  onClose,
}: {
  quiz: QuizDraft;
  questions: Question[];
  startIndex: number;
  onClose: () => void;
}) {
  // Built once per opening: start from the selected question so authors can check it quickly.
  const [{ adapter, info }] = useState(() => {
    const snapshot = snapshotFromDraft(quiz, [
      ...questions.slice(startIndex),
      ...questions.slice(0, startIndex),
    ]);
    const policy = DEFAULT_POLICIES.practice;
    const info: PlayInfo = {
      title: quiz.title,
      description: quiz.description,
      coverUrl: quiz.coverUrl,
      theme: quiz.theme,
      questionCount: snapshot.questions.length,
      policy: {
        feedback: policy.feedback,
        gamification: policy.gamification,
        showCorrectAnswer: policy.showCorrectAnswer,
        attempts: policy.attempts,
      },
    };
    return { adapter: createLocalPracticeAdapter(snapshot, policy), info };
  });
  const skipped = questions.length - info.questionCount;

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="flex items-center gap-2 border-b border-line bg-surface px-4 py-2 text-sm">
        <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent-fg">
          Pratinjau
        </span>
        <span className="text-fg-subtle">
          Jawaban tidak disimpan.
          {skipped > 0 && ` ${skipped} soal belum bisa dimainkan dan dilewati.`}
        </span>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={onClose}>
          <X /> Tutup
        </Button>
      </div>
      <PracticePlayer
        info={info}
        adapter={adapter}
        storageKey={null}
        autoJoinAs="Kamu"
        onExit={onClose}
        exitLabel="Kembali ke editor"
      />
    </div>
  );
}
