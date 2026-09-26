"use client";

import { useMemo } from "react";

import { QuizEditor } from "@/components/editor/QuizEditor";
import type { EditorAdapter, EditorInitialState } from "@/components/editor/types";
import { uploadQuizMedia } from "@/lib/supabase/upload";

import { publishQuizAction, saveQuizDraftAction } from "../../actions";
import { ShareButton } from "./ShareDialog";

/** Wires the editor to Server Actions (save/publish) and Supabase Storage (uploads). */
export function EditorPage({ initial, ownerId }: { initial: EditorInitialState; ownerId: string }) {
  const adapter = useMemo<EditorAdapter>(
    () => ({
      saveDraft: saveQuizDraftAction,
      publish: publishQuizAction,
      uploadMedia: (file, quizId) => uploadQuizMedia(file, ownerId, quizId),
    }),
    [ownerId],
  );
  return (
    <QuizEditor
      initial={initial}
      adapter={adapter}
      backHref="/quizzes"
      headerActions={<ShareButton quizId={initial.quiz.id} />}
    />
  );
}
