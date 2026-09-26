import { z } from "zod";

import type { EditorInitialState } from "@/components/editor/types";
import { questionSchema, type Question } from "@/questions/question";
import { getDefinition, isQuestionType } from "@/questions/registry";
import { mediaSchema, type MediaRef } from "@/questions/shared";

import type { Json, Tables } from "./supabase/database.types";
import type { QuizTheme } from "./theme";

// ─── DB rows → editor ─────────────────────────────────────────────────────────

type QuestionRow = Pick<
  Tables<"questions">,
  | "id"
  | "type"
  | "prompt"
  | "help"
  | "media"
  | "config"
  | "time_limit_s"
  | "points"
  | "explanation"
  | "tags"
>;
type QuizRow = Pick<
  Tables<"quizzes">,
  | "id"
  | "title"
  | "description"
  | "cover_url"
  | "theme"
  | "draft_revision"
  | "published_revision"
  | "latest_version"
  | "slug"
>;

const themeSchema = z.object({ primary: z.string().optional(), bg: z.string().optional() });

/** A stored question as the editor sees it. Rows with an unknown type are dropped (logged). */
export function rowToQuestion(row: QuestionRow): Question | null {
  if (!isQuestionType(row.type)) {
    console.warn(`Skipping question ${row.id}: unknown type "${row.type}"`);
    return null;
  }
  const media = z.array(mediaSchema).safeParse(row.media);
  return {
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    help: row.help,
    media: media.success ? media.data : [],
    config: row.config,
    timeLimitS: row.time_limit_s,
    points: row.points,
    explanation: row.explanation,
    tags: row.tags,
  };
}

export function toEditorState(quiz: QuizRow, rows: QuestionRow[]): EditorInitialState {
  const theme = themeSchema.safeParse(quiz.theme);
  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      coverUrl: quiz.cover_url,
      theme: theme.success ? (theme.data as QuizTheme) : {},
    },
    questions: rows.map(rowToQuestion).filter((q): q is Question => q !== null),
    revision: quiz.draft_revision,
    publishedRevision: quiz.published_revision,
    latestVersion: quiz.latest_version,
    slug: quiz.slug,
  };
}

// ─── Editor → save_quiz_draft payload ─────────────────────────────────────────

/** Only media we host may be referenced — no hotlinked trackers or arbitrary URLs. */
export function isOwnMediaUrl(url: string, supabaseUrl: string): boolean {
  const base = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/quiz-media/`;
  return url.startsWith(base) && !url.slice(base.length).includes("..");
}

export const saveDraftInputSchema = z.object({
  quizId: z.uuid(),
  baseRevision: z.number().int().min(0),
  quiz: z.object({
    title: z.string().max(150),
    description: z.string().max(2000),
    coverUrl: z.string().max(1000).nullable(),
    theme: themeSchema,
  }),
  questions: z.array(questionSchema).max(200),
});

export type DraftProblem = { questionId?: string; message: string };

/**
 * Server-side check of an autosave payload beyond the envelope schema: every
 * config must match its type's schema and media must live in our bucket.
 */
export function checkDraft(
  input: z.infer<typeof saveDraftInputSchema>,
  supabaseUrl: string,
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  const ids = new Set<string>();
  if (input.quiz.coverUrl && !isOwnMediaUrl(input.quiz.coverUrl, supabaseUrl)) {
    problems.push({ message: "Sampul harus diunggah lewat editor." });
  }
  for (const q of input.questions) {
    if (ids.has(q.id)) problems.push({ questionId: q.id, message: "Id soal ganda." });
    ids.add(q.id);
    if (!getDefinition(q.type).configSchema.safeParse(q.config).success) {
      problems.push({ questionId: q.id, message: "Isi soal tidak valid." });
    }
    if (q.media.some((m: MediaRef) => !isOwnMediaUrl(m.url, supabaseUrl))) {
      problems.push({ questionId: q.id, message: "Media harus diunggah lewat editor." });
    }
  }
  return problems;
}

export function toDraftPayload(questions: Question[]): Json {
  return questions.map((q) => ({
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    help: q.help,
    media: q.media,
    config: q.config,
    time_limit_s: q.timeLimitS,
    points: q.points,
    explanation: q.explanation,
    tags: q.tags,
  })) as Json;
}

// ─── Slugs ────────────────────────────────────────────────────────────────────

/** URL slug for a published quiz: "Kuis IPA Kelas 8!" → "kuis-ipa-kelas-8-x7k2". */
export function makeSlug(title: string, suffix: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50)
    .replace(/-+$/g, "");
  return [base || "quiz", suffix.toLowerCase().replace(/[^a-z0-9]/g, "")].filter(Boolean).join("-");
}
