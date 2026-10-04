"use client";

import { ClipboardCheck, MonitorPlay } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import { QuizEditor } from "@/components/editor/QuizEditor";
import type { EditorAdapter, EditorInitialState } from "@/components/editor/types";
import { Button } from "@/components/ui/Button";
import { uploadQuizMedia } from "@/lib/supabase/upload";

import { publishQuizAction, saveQuizDraftAction } from "../../actions";
import { generateQuestionsAction } from "../../ai-actions";
import { questionTagsAction, searchQuestionBankAction } from "../../bank-actions";
import { ShareButton } from "./ShareDialog";

/** Wires the editor to Server Actions (save/publish) and Supabase Storage (uploads). */
export function EditorPage({
  initial,
  ownerId,
  aiEnabled,
}: {
  initial: EditorInitialState;
  ownerId: string;
  aiEnabled: boolean;
}) {
  const adapter = useMemo<EditorAdapter>(
    () => ({
      saveDraft: saveQuizDraftAction,
      publish: publishQuizAction,
      uploadMedia: (file, quizId) => uploadQuizMedia(file, ownerId, quizId),
      questionBank: {
        tags: questionTagsAction,
        search: (query) => searchQuestionBankAction(query, initial.quiz.id),
      },
      ...(aiEnabled && { generateQuestions: generateQuestionsAction }),
    }),
    [ownerId, initial.quiz.id, aiEnabled],
  );
  return (
    <QuizEditor
      initial={initial}
      adapter={adapter}
      backHref="/quizzes"
      headerActions={
        <>
          <Button asChild variant="secondary" aria-label="Live">
            <Link href={`/quizzes/${initial.quiz.id}/live`}>
              <MonitorPlay /> <span className="hidden sm:inline">Live</span>
            </Link>
          </Button>
          <Button asChild variant="secondary" aria-label="Ujian">
            <Link href={`/quizzes/${initial.quiz.id}/exams`}>
              <ClipboardCheck /> <span className="hidden sm:inline">Ujian</span>
            </Link>
          </Button>
          <ShareButton quizId={initial.quiz.id} />
        </>
      }
    />
  );
}
