import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";

import { requireHost } from "@/lib/auth";
import { toEditorState } from "@/lib/quiz-data";
import { createClient } from "@/lib/supabase/server";

import { EditorPage } from "./EditorPage";

export const metadata: Metadata = { title: "Editor" };

export default async function EditQuizPage({ params }: PageProps<"/quizzes/[id]/edit">) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const user = await requireHost(`/quizzes/${id}/edit`);

  const supabase = await createClient();
  const [{ data: quiz }, { data: questions, error }] = await Promise.all([
    supabase
      .from("quizzes")
      .select(
        "id, title, description, cover_url, theme, draft_revision, published_revision, latest_version, slug",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("questions")
      .select("id, type, prompt, help, media, config, time_limit_s, points, explanation, tags")
      .eq("quiz_id", id)
      .order("position"),
  ]);
  // RLS hides other people's quizzes, so "not yours" and "doesn't exist" look the same.
  if (!quiz || error) notFound();

  return <EditorPage initial={toEditorState(quiz, questions)} ownerId={user.id} />;
}
