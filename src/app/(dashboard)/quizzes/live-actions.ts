"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  liveFormSchema,
  livePolicyFrom,
  liveQuestionOrder,
  type LiveForm,
} from "@/engine/live/form";
import { parseSnapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { randomSeed } from "@/lib/seed-random";

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const id = z.uuid();

/** Open a live or Rebutan session in its lobby (P5-09, P6-06); the host goes to /host/[id]. */
export async function createLiveSessionAction(
  quizId: string,
  input: LiveForm,
): Promise<ActionResult<{ sessionId: string }>> {
  const quiz = id.safeParse(quizId);
  const form = liveFormSchema.safeParse(input);
  if (!quiz.success) return { ok: false, error: "Quiz tidak ditemukan." };
  if (!form.success) return { ok: false, error: "Pengaturan tidak valid." };
  await requireHost();
  const supabase = await createClient();

  const { data: version } = await supabase
    .from("quiz_versions")
    .select("id, snapshot")
    .eq("quiz_id", quiz.data)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const snapshot = parseSnapshot(version?.snapshot);
  if (!version || !snapshot) return { ok: false, error: "Publish quiz dulu sebelum memulai live." };

  const policy = livePolicyFrom(form.data);
  const seed = randomSeed();
  const questionIds = liveQuestionOrder(snapshot, policy, seed, form.data.mode);
  if (questionIds.length === 0) {
    return {
      ok: false,
      error:
        form.data.mode === "live"
          ? "Tidak ada soal yang bisa dimainkan secara live."
          : "Tidak ada soal yang bisa dimainkan untuk rebutan.",
    };
  }

  for (let i = 0; i < 5; i++) {
    const { data: code } = await supabase.rpc("generate_session_code");
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        quiz_id: quiz.data,
        quiz_version_id: version.id,
        mode: form.data.mode,
        status: "lobby",
        phase: "lobby",
        code,
        policy: policy as Json,
        seed,
        question_ids: questionIds,
        auto_advance: policy.autoAdvance,
      })
      .select("id")
      .single();
    if (data) {
      revalidatePath(`/quizzes/${quiz.data}/live`);
      return { ok: true, sessionId: data.id };
    }
    // Another session took the code in the meantime: draw again.
    if (error?.code !== "23505") break;
  }
  return { ok: false, error: "Gagal membuat sesi live. Coba lagi." };
}

export async function deleteLiveSessionAction(sessionId: string): Promise<ActionResult> {
  if (!id.safeParse(sessionId).success) return { ok: false, error: "Sesi tidak ditemukan." };
  await requireHost();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sessions")
    .delete()
    .eq("id", sessionId)
    .in("mode", ["live", "battle_buzzer", "battle_royale"])
    .select("quiz_id")
    .maybeSingle();
  if (error || !data) return { ok: false, error: "Gagal menghapus sesi." };
  revalidatePath(`/quizzes/${data.quiz_id}/live`);
  return { ok: true };
}
