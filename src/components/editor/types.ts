import type { QuizTheme } from "@/lib/theme";
import type { Question, QuizIssue } from "@/questions/question";
import type { MediaRef } from "@/questions/shared";

export type { QuizTheme };

/** Quiz-level fields edited in the builder (a `quizzes` row, camelCased). */
export type QuizDraft = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  theme: QuizTheme;
};

export type SaveDraftInput = {
  quizId: string;
  baseRevision: number;
  quiz: Omit<QuizDraft, "id">;
  questions: Question[];
};

export type SaveDraftResult =
  | { ok: true; revision: number }
  | { ok: false; error: "conflict" | "not_found" | "invalid" | "unknown"; message?: string };

export type PublishResult =
  | { ok: true; version: number; slug: string; revision: number }
  | { ok: false; error: "issues"; issues: QuizIssue[] }
  | { ok: false; error: "conflict" | "not_found" | "unknown"; message?: string };

/**
 * Everything the editor needs from the outside world. The quiz page wires these
 * to Server Actions + Supabase Storage; the dev playground uses in-memory fakes.
 */
export type EditorAdapter = {
  saveDraft: (input: SaveDraftInput) => Promise<SaveDraftResult>;
  publish: (input: { quizId: string; revision: number }) => Promise<PublishResult>;
  uploadMedia: (file: File, quizId: string) => Promise<MediaRef>;
};

export type EditorInitialState = {
  quiz: QuizDraft;
  questions: Question[];
  revision: number;
  publishedRevision: number | null;
  latestVersion: number | null;
  slug: string | null;
};
