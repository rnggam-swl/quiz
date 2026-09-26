import { z } from "zod";

import type { QuizDraft } from "@/components/editor/types";
import type { QuizTheme } from "@/lib/theme";
import type { Question } from "@/questions/question";
import { getDefinition, isQuestionType, type QuestionType } from "@/questions/registry";
import { mediaSchema, type MediaRef } from "@/questions/shared";

/** A playable question: a published (or previewed) question with a parsed config. */
export type SnapshotQuestion = {
  id: string;
  type: QuestionType;
  prompt: string;
  help: string;
  media: MediaRef[];
  /** Full config including the answer key — server side (or local preview) only. */
  config: unknown;
  points: number;
  explanation: string;
  timeLimitS: number | null;
};

export type SnapshotQuiz = {
  id: string;
  title: string;
  description: string;
  coverUrl: string | null;
  theme: QuizTheme;
};

export type Snapshot = { quiz: SnapshotQuiz; questions: SnapshotQuestion[] };

// Shape written by publish_quiz() (supabase/migrations/20260926000000_content.sql).
const rawSnapshotSchema = z.object({
  quiz: z.object({
    id: z.string(),
    title: z.string(),
    description: z.string().catch(""),
    cover_url: z.string().nullable().catch(null),
    theme: z.object({ primary: z.string().optional(), bg: z.string().optional() }).catch({}),
  }),
  questions: z.array(
    z.object({
      id: z.string(),
      type: z.string(),
      prompt: z.string().catch(""),
      help: z.string().catch(""),
      media: z.array(mediaSchema).catch([]),
      config: z.unknown(),
      time_limit_s: z.number().nullable().catch(null),
      points: z.number().catch(1000),
      explanation: z.string().catch(""),
    }),
  ),
});

/** Keep only questions of known types whose config still matches their schema. */
function playable(q: Omit<SnapshotQuestion, "type"> & { type: string }): SnapshotQuestion | null {
  if (!isQuestionType(q.type)) return null;
  const config = getDefinition(q.type).configSchema.safeParse(q.config);
  return config.success ? { ...q, type: q.type, config: config.data } : null;
}

export function parseSnapshot(raw: unknown): Snapshot | null {
  const parsed = rawSnapshotSchema.safeParse(raw);
  if (!parsed.success) return null;
  const { quiz, questions } = parsed.data;
  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      coverUrl: quiz.cover_url,
      theme: quiz.theme,
    },
    questions: questions
      .map((q) =>
        playable({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          help: q.help,
          media: q.media,
          config: q.config,
          points: q.points,
          explanation: q.explanation,
          timeLimitS: q.time_limit_s,
        }),
      )
      .filter((q): q is SnapshotQuestion => q !== null),
  };
}

/** The editor's current draft as a snapshot, for the in-editor preview. */
export function snapshotFromDraft(quiz: QuizDraft, questions: Question[]): Snapshot {
  return {
    quiz: {
      id: quiz.id,
      title: quiz.title,
      description: quiz.description,
      coverUrl: quiz.coverUrl,
      theme: quiz.theme,
    },
    questions: questions
      .map((q) =>
        playable({
          id: q.id,
          type: q.type,
          prompt: q.prompt,
          help: q.help,
          media: q.media,
          config: q.config,
          points: q.points,
          explanation: q.explanation,
          timeLimitS: q.timeLimitS,
        }),
      )
      .filter((q): q is SnapshotQuestion => q !== null),
  };
}
