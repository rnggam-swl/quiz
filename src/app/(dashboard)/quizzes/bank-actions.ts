"use server";

import { z } from "zod";

import type { BankPage, BankQuery, TagUse } from "@/components/editor/types";
import { requireHost } from "@/lib/auth";
import { escapeLike } from "@/lib/format";
import { QUESTION_COLUMNS, rowToQuestion } from "@/lib/quiz-data";
import { createClient } from "@/lib/supabase/server";
import { QUESTION_TYPES } from "@/questions/registry";

// Bank soal (P8-12): the host's questions from their other quizzes. Runs as the host, so
// RLS keeps it to their own quizzes.

const PAGE_SIZE = 20;

const querySchema = z.object({
  text: z.string().trim().max(100),
  tags: z.array(z.string().trim().min(1).max(30)).max(10),
  type: z.enum(QUESTION_TYPES).nullable(),
  page: z.number().int().min(0).max(50),
});

export async function questionTagsAction(): Promise<TagUse[]> {
  await requireHost();
  const supabase = await createClient();
  const { data } = await supabase.rpc("my_question_tags");
  return (data ?? []).map((row) => ({ tag: row.tag, uses: Number(row.uses) }));
}

export async function searchQuestionBankAction(
  query: BankQuery,
  excludeQuizId: string,
): Promise<BankPage> {
  await requireHost();
  const parsed = querySchema.safeParse(query);
  const exclude = z.uuid().safeParse(excludeQuizId);
  if (!parsed.success || !exclude.success) return { items: [], hasMore: false };
  const { text, tags, type, page } = parsed.data;

  const supabase = await createClient();
  let request = supabase
    .from("questions")
    .select(`${QUESTION_COLUMNS}, quizzes!inner(title)` as const)
    .neq("quiz_id", exclude.data)
    .order("updated_at", { ascending: false })
    .order("id")
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  if (text) request = request.ilike("prompt", `%${escapeLike(text)}%`);
  if (tags.length) request = request.contains("tags", tags);
  if (type) request = request.eq("type", type);
  const { data, error } = await request;
  if (error || !data) return { items: [], hasMore: false };

  const items = data.slice(0, PAGE_SIZE).flatMap((row) => {
    const question = rowToQuestion(row);
    return question ? [{ question, quizTitle: row.quizzes.title || "Quiz tanpa judul" }] : [];
  });
  return { items, hasMore: data.length > PAGE_SIZE };
}
