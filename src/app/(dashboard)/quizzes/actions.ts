"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import type { PublishResult, SaveDraftInput, SaveDraftResult } from "@/components/editor/types";
import { getSessionUser, requireHost } from "@/lib/auth";
import { getPublicEnv } from "@/lib/env";
import { createId } from "@/lib/id";
import {
  checkDraft,
  makeSlug,
  saveDraftInputSchema,
  toDraftPayload,
  toEditorState,
} from "@/lib/quiz-data";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { validateQuiz } from "@/questions/question";

const QUIZ_COLUMNS =
  "id, title, description, cover_url, theme, draft_revision, published_revision, latest_version, slug";
const QUESTION_COLUMNS =
  "id, type, prompt, help, media, config, time_limit_s, points, explanation, tags";

/** Map the RPCs' raised exceptions (see the migration) to editor results. */
function rpcError(message: string | undefined): "conflict" | "not_found" | "unknown" {
  if (message?.includes("revision_conflict")) return "conflict";
  if (message?.includes("quiz_not_found")) return "not_found";
  return "unknown";
}

/** Autosave (called by the editor, debounced). Runs as the user, so RLS scopes it to their quizzes. */
export async function saveQuizDraftAction(input: SaveDraftInput): Promise<SaveDraftResult> {
  const user = await getSessionUser();
  if (!user || user.isAnonymous) return { ok: false, error: "not_found" };

  const parsed = saveDraftInputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: "invalid", message: parsed.error.issues[0]?.message };
  const problems = checkDraft(parsed.data, getPublicEnv().NEXT_PUBLIC_SUPABASE_URL);
  if (problems.length) return { ok: false, error: "invalid", message: problems[0]!.message };

  const { quizId, baseRevision, quiz, questions } = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_quiz_draft", {
    p_quiz_id: quizId,
    p_base_revision: baseRevision,
    p_quiz: {
      title: quiz.title,
      description: quiz.description,
      cover_url: quiz.coverUrl,
      theme: quiz.theme,
    } as Json,
    p_questions: toDraftPayload(questions),
  });
  if (error) {
    const kind = rpcError(error.message);
    if (kind === "unknown") console.error("save_quiz_draft failed", error);
    return { ok: false, error: kind };
  }
  return { ok: true, revision: data };
}

/**
 * Validate the saved draft on the server and snapshot it as a new version. The
 * revision the client saw must still be the latest, so what we validate is
 * exactly what gets published.
 */
export async function publishQuizAction(input: {
  quizId: string;
  revision: number;
}): Promise<PublishResult> {
  const { quizId, revision } = z
    .object({ quizId: z.uuid(), revision: z.number().int().min(0) })
    .parse(input);
  await requireHost();
  const supabase = await createClient();

  const [{ data: quiz }, { data: rows }] = await Promise.all([
    supabase.from("quizzes").select(QUIZ_COLUMNS).eq("id", quizId).maybeSingle(),
    supabase.from("questions").select(QUESTION_COLUMNS).eq("quiz_id", quizId).order("position"),
  ]);
  if (!quiz) return { ok: false, error: "not_found" };
  if (quiz.draft_revision !== revision) return { ok: false, error: "conflict" };

  const state = toEditorState(quiz, rows ?? []);
  const issues = validateQuiz(state.quiz, state.questions);
  if (issues.length) return { ok: false, error: "issues", issues };

  const { data, error } = await supabase
    .rpc("publish_quiz", {
      p_quiz_id: quizId,
      p_base_revision: revision,
      p_slug: makeSlug(quiz.title, createId().slice(0, 5)),
    })
    .single();
  if (error || !data) {
    const kind = rpcError(error?.message);
    if (kind === "unknown") console.error("publish_quiz failed", error);
    return { ok: false, error: kind === "unknown" ? "unknown" : kind };
  }

  revalidatePath("/quizzes");
  return { ok: true, version: data.version, slug: data.slug, revision };
}

export async function createQuizAction(): Promise<void> {
  await requireHost("/quizzes");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quizzes")
    .insert({ title: "" })
    .select("id")
    .single();
  if (error || !data) throw new Error("Gagal membuat quiz.");
  redirect(`/quizzes/${data.id}/edit`);
}

export async function duplicateQuizAction(quizId: string): Promise<{ ok: boolean }> {
  const id = z.uuid().parse(quizId);
  await requireHost();
  const supabase = await createClient();

  const [{ data: quiz }, { data: rows }] = await Promise.all([
    supabase.from("quizzes").select(QUIZ_COLUMNS).eq("id", id).maybeSingle(),
    supabase.from("questions").select(QUESTION_COLUMNS).eq("quiz_id", id).order("position"),
  ]);
  if (!quiz) return { ok: false };

  const { data: copy, error } = await supabase
    .from("quizzes")
    .insert({
      title: `Salinan ${quiz.title || "quiz tanpa judul"}`.slice(0, 150),
      description: quiz.description,
      cover_url: quiz.cover_url,
      theme: quiz.theme,
    })
    .select("id")
    .single();
  if (error || !copy) return { ok: false };

  const questions = toEditorState(quiz, rows ?? []).questions.map((q) => ({
    ...q,
    id: crypto.randomUUID(),
  }));
  const saved = await supabase.rpc("save_quiz_draft", {
    p_quiz_id: copy.id,
    p_base_revision: 0,
    p_quiz: {},
    p_questions: toDraftPayload(questions),
  });
  if (saved.error) {
    await supabase.from("quizzes").delete().eq("id", copy.id);
    return { ok: false };
  }

  revalidatePath("/quizzes");
  return { ok: true };
}

export async function deleteQuizAction(quizId: string): Promise<{ ok: boolean }> {
  const id = z.uuid().parse(quizId);
  await requireHost();
  const supabase = await createClient();
  // RLS limits this to the caller's own quizzes; questions and versions cascade.
  // Uploaded media stay in Storage for now; orphan cleanup is task P8-15.
  const { error, count } = await supabase.from("quizzes").delete({ count: "exact" }).eq("id", id);
  revalidatePath("/quizzes");
  return { ok: !error && count === 1 };
}
