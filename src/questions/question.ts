import { z } from "zod";

import { getDefinition, QUESTION_TYPES, type QuestionType } from "./registry";
import { mediaSchema } from "./shared";
import type { Issue } from "./types";

export const TIME_LIMIT = { min: 5, max: 600 } as const;
export const DEFAULT_POINTS = 1000;

/**
 * The type-independent envelope of a question — mirrors a `questions` row
 * (docs/03-data-model.md). `config` is validated by the type's own schema.
 */
export const questionSchema = z.object({
  /** UUID generated on the client so the editor can add questions before the first save. */
  id: z.uuid(),
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().max(2000),
  help: z.string().max(1000),
  media: z.array(mediaSchema).max(4),
  config: z.unknown(),
  /** Seconds; null = use the session policy default. */
  timeLimitS: z.number().int().min(TIME_LIMIT.min).max(TIME_LIMIT.max).nullable(),
  points: z.number().int().min(0).max(10_000),
  explanation: z.string().max(2000),
  tags: z.array(z.string().min(1).max(30)).max(10),
});
export type Question = z.infer<typeof questionSchema>;

export function createQuestion(type: QuestionType): Question {
  return {
    id: crypto.randomUUID(),
    type,
    prompt: "",
    help: "",
    media: [],
    config: getDefinition(type).defaults(),
    timeLimitS: null,
    points: DEFAULT_POINTS,
    explanation: "",
    tags: [],
  };
}

export function duplicateQuestion(question: Question): Question {
  return { ...structuredClone(question), id: crypto.randomUUID() };
}

/**
 * Switch a question to another type, keeping the envelope (prompt, media, points…).
 * The config resets to the new type's defaults — callers should confirm first
 * when `hasAuthoredContent(question.config)` is true.
 */
export function changeQuestionType(question: Question, type: QuestionType): Question {
  if (question.type === type) return question;
  return { ...question, type, config: getDefinition(type).defaults() };
}

const ID_KEYS = new Set(["id", "leftId", "rightId", "oddId", "groupId", "startId", "targetId"]);

/**
 * Whether a config holds anything the author typed. Text and numbers count unless
 * they equal `baseline` (the type's defaults) at the same path — so a fresh slider
 * (max 100) or a mode switch ("letter") isn't mistaken for work. Ids never count.
 */
export function hasAuthoredContent(value: unknown, baseline?: unknown, key?: string): boolean {
  if (key && ID_KEYS.has(key)) return false;
  if (typeof value === "string") return value.trim().length > 0 && value !== baseline;
  if (typeof value === "number") return value !== (typeof baseline === "number" ? baseline : 0);
  if (Array.isArray(value)) {
    const base = Array.isArray(baseline) ? baseline : [];
    return value.some((v, i) => hasAuthoredContent(v, base[i]));
  }
  if (value && typeof value === "object") {
    const base = (baseline && typeof baseline === "object" ? baseline : {}) as Record<
      string,
      unknown
    >;
    return Object.entries(value).some(([k, v]) => hasAuthoredContent(v, base[k], k));
  }
  return false;
}

/** Everything that blocks publishing this question. Paths are relative to the question. */
export function validateQuestion(question: Question): Issue[] {
  const issues: Issue[] = [];
  if (!question.prompt.trim() && question.media.length === 0) {
    issues.push({ path: "prompt", message: "Pertanyaan belum diisi." });
  }
  const definition = getDefinition(question.type);
  const parsed = definition.configSchema.safeParse(question.config);
  if (!parsed.success) {
    issues.push({ path: "config", message: "Isi soal tidak valid — coba ganti tipe soal lagi." });
    return issues;
  }
  for (const issue of definition.validate(parsed.data)) {
    issues.push({ ...issue, path: issue.path ? `config.${issue.path}` : "config" });
  }
  return issues;
}

export type QuizIssue = Issue & { questionId?: string; questionIndex?: number };

export type QuizMeta = { title: string };

/** Publish check for a whole quiz: quiz-level problems first, then per question in order. */
export function validateQuiz(quiz: QuizMeta, questions: Question[]): QuizIssue[] {
  const issues: QuizIssue[] = [];
  if (!quiz.title.trim()) issues.push({ path: "title", message: "Judul quiz belum diisi." });
  if (questions.length === 0) issues.push({ message: "Quiz belum punya soal." });
  questions.forEach((question, index) => {
    for (const issue of validateQuestion(question)) {
      issues.push({
        ...issue,
        message: `Soal #${index + 1}: ${issue.message}`,
        questionId: question.id,
        questionIndex: index,
      });
    }
  });
  return issues;
}
