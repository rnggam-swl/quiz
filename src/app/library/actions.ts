"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** "Salin ke quiz saya" (P8-11): a private draft copy, opened in the editor. */
export async function copyLibraryQuizAction(form: FormData): Promise<void> {
  const id = z.uuid().parse(form.get("quizId"));
  await requireHost(`/library/${id}`);
  const supabase = await createClient();
  const { data: copyId, error } = await supabase.rpc("copy_library_quiz", { p_quiz_id: id });
  if (error || !copyId) redirect(`/library/${id}?error=copy`);
  redirect(`/quizzes/${copyId}/edit`);
}
