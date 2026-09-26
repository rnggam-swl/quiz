"use client";

import { Plus } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, type ComponentProps, type ComponentType } from "react";

import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { validateQuestion, type Question } from "@/questions/question";
import { questionUI } from "@/questions/ui";
import type { EditorProps } from "@/questions/ui-types";

import { AddQuestionMenu } from "./AddQuestionMenu";
import { useEditor, useEditorContext } from "./EditorContext";
import { MediaField } from "./MediaField";

/** Textarea that grows with its content (field-sizing isn't in every browser yet). */
function AutoTextarea({
  value,
  className,
  ...props
}: ComponentProps<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      className={cn("resize-none", className)}
      {...props}
    />
  );
}

export function QuestionCanvas() {
  const { store } = useEditorContext();
  const quizId = useEditor((s) => s.quiz.id);
  const question = useEditor((s) => s.questions.find((q) => q.id === s.selectedId) ?? null);
  const index = useEditor((s) => s.questions.findIndex((q) => q.id === s.selectedId));
  const showIssues = useEditor((s) => s.showIssues);

  if (!question) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
        <p className="text-lg font-medium">Quiz ini belum punya soal</p>
        <p className="max-w-sm text-sm text-fg-muted">
          Pilih tipe soal untuk memulai. Kamu bisa menggantinya nanti di panel kanan.
        </p>
        <AddQuestionMenu align="center" onAdd={(type) => store.getState().addQuestion(type)}>
          <Button size="lg">
            <Plus /> Tambah soal pertama
          </Button>
        </AddQuestionMenu>
      </div>
    );
  }

  return (
    <QuestionForm
      // Remount per question so local input state (e.g. number fields) never leaks across questions.
      key={question.id}
      question={question}
      index={index}
      quizId={quizId}
      showIssues={showIssues}
      onPatch={(patch) => store.getState().updateQuestion(question.id, patch)}
      onConfig={(config) => store.getState().updateConfig(question.id, config)}
    />
  );
}

function QuestionForm({
  question,
  index,
  quizId,
  showIssues,
  onPatch,
  onConfig,
}: {
  question: Question;
  index: number;
  quizId: string;
  showIssues: boolean;
  onPatch: (patch: Partial<Pick<Question, "prompt" | "help" | "media">>) => void;
  onConfig: (config: unknown) => void;
}) {
  const issues = useMemo(
    () => (showIssues ? validateQuestion(question) : []),
    [question, showIssues],
  );
  const invalidPaths = useMemo(
    () => new Set(issues.flatMap((i) => (i.path?.startsWith("config.") ? [i.path.slice(7)] : []))),
    [issues],
  );
  const promptInvalid = issues.some((i) => i.path === "prompt");
  const Editor = questionUI[question.type].Editor as ComponentType<EditorProps<unknown>>;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:px-8 lg:py-12">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold tracking-wide text-fg-subtle uppercase">
          Soal {index + 1}
        </span>
        <AutoTextarea
          value={question.prompt}
          onChange={(e) => onPatch({ prompt: e.target.value })}
          maxLength={2000}
          placeholder="Tulis pertanyaan…"
          aria-label="Pertanyaan"
          aria-invalid={promptInvalid || undefined}
          data-autofocus-prompt
          className={cn(
            "w-full bg-transparent text-2xl leading-snug font-semibold text-fg outline-none placeholder:text-fg-placeholder",
            promptInvalid && "rounded-lg ring-2 ring-danger ring-offset-4 ring-offset-canvas",
          )}
        />
        <AutoTextarea
          value={question.help}
          onChange={(e) => onPatch({ help: e.target.value })}
          maxLength={1000}
          placeholder="Teks bantuan (opsional)"
          aria-label="Teks bantuan"
          className="w-full bg-transparent text-base text-fg-muted outline-none placeholder:text-fg-placeholder"
        />
      </div>

      <MediaField quizId={quizId} media={question.media} onChange={(media) => onPatch({ media })} />

      <div className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
        <Editor config={question.config} onChange={onConfig} invalidPaths={invalidPaths} />
      </div>

      {issues.length > 0 && (
        <ul
          className="flex flex-col gap-1 rounded-xl bg-danger-soft p-3 text-sm text-danger"
          aria-label="Masalah di soal ini"
        >
          {issues.map((issue, i) => (
            <li key={i}>• {issue.message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
