"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { examFormSchema, examPolicy, type ExamForm } from "@/engine/exam/form";
import { parseRoster, type RosterProblem } from "@/engine/exam/roster";
import { parseSnapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { rubricRatio, type EssayConfig } from "@/questions/essay/definition";

// Host-side exam management (docs/08-mode-exam.md). Everything runs as the host, so RLS
// and the owner-checked RPCs keep it to their own quizzes.

type ActionResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const id = z.uuid();
export async function createExamAction(
  quizId: string,
  input: ExamForm,
): Promise<ActionResult<{ examId: string }>> {
  const quiz = id.safeParse(quizId);
  const form = examFormSchema.safeParse(input);
  if (!quiz.success) return { ok: false, error: "Quiz tidak ditemukan." };
  if (!form.success)
    return { ok: false, error: form.error.issues[0]?.message ?? "Isian tidak valid." };
  await requireHost();
  const supabase = await createClient();

  // Exams pin the version they were created with: later edits don't change a running exam.
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("id")
    .eq("quiz_id", quiz.data)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!version) return { ok: false, error: "Publish quiz dulu sebelum membuat ujian." };

  for (let i = 0; i < 5; i++) {
    const { data: code } = await supabase.rpc("generate_session_code");
    const { data, error } = await supabase
      .from("sessions")
      .insert({
        quiz_id: quiz.data,
        quiz_version_id: version.id,
        mode: "exam",
        status: "running",
        title: form.data.title,
        opens_at: form.data.opensAt,
        closes_at: form.data.closesAt,
        policy: examPolicy(form.data) as Json,
        code,
      })
      .select("id")
      .single();
    if (data) {
      revalidatePath(`/quizzes/${quiz.data}/exams`);
      return { ok: true, examId: data.id };
    }
    // Another session took the code in the meantime: draw again.
    if (error?.code !== "23505") break;
  }
  return { ok: false, error: "Gagal membuat ujian. Coba lagi." };
}

async function examOf(examId: string) {
  if (!id.safeParse(examId).success) return null;
  await requireHost();
  const supabase = await createClient();
  const { data } = await supabase
    .from("sessions")
    .select("id, quiz_id")
    .eq("id", examId)
    .eq("mode", "exam")
    .maybeSingle();
  return data ? { supabase, exam: data } : null;
}

function refresh(quizId: string, examId: string) {
  revalidatePath(`/quizzes/${quizId}/exams`);
  revalidatePath(`/quizzes/${quizId}/exams/${examId}`, "layout");
}

export async function endExamAction(examId: string): Promise<ActionResult> {
  const found = await examOf(examId);
  if (!found) return { ok: false, error: "Ujian tidak ditemukan." };
  const { error } = await found.supabase.rpc("end_exam", { p_session_id: examId });
  if (error) return { ok: false, error: "Gagal mengakhiri ujian." };
  refresh(found.exam.quiz_id, examId);
  return { ok: true };
}

export async function setResultsReleasedAction(
  examId: string,
  released: boolean,
): Promise<ActionResult> {
  const found = await examOf(examId);
  if (!found) return { ok: false, error: "Ujian tidak ditemukan." };
  const { error } = await found.supabase
    .from("sessions")
    .update({ results_released_at: released ? new Date().toISOString() : null })
    .eq("id", examId);
  if (error) return { ok: false, error: "Gagal menyimpan." };
  refresh(found.exam.quiz_id, examId);
  return { ok: true };
}

export async function deleteExamAction(examId: string): Promise<ActionResult> {
  const found = await examOf(examId);
  if (!found) return { ok: false, error: "Ujian tidak ditemukan." };
  const { error } = await found.supabase.from("sessions").delete().eq("id", examId);
  if (error) return { ok: false, error: "Gagal menghapus ujian." };
  revalidatePath(`/quizzes/${found.exam.quiz_id}/exams`);
  return { ok: true };
}

export async function importRosterAction(
  examId: string,
  text: string,
): Promise<ActionResult<{ added: number; skipped: number; problems: RosterProblem[] }>> {
  if (typeof text !== "string" || text.length > 200_000) {
    return { ok: false, error: "Teks terlalu panjang." };
  }
  const found = await examOf(examId);
  if (!found) return { ok: false, error: "Ujian tidak ditemukan." };
  const { entries, problems } = parseRoster(text);

  const { data: existing } = await found.supabase
    .from("session_roster")
    .select("identifier")
    .eq("session_id", examId);
  const known = new Set((existing ?? []).map((r) => r.identifier.trim().toLowerCase()));
  const fresh = entries.filter((e) => !known.has(e.identifier.trim().toLowerCase()));
  if (fresh.length) {
    const { error } = await found.supabase.from("session_roster").insert(
      fresh.map((e) => ({
        session_id: examId,
        name: e.name,
        identifier: e.identifier,
        extra_time_pct: e.extraTimePct,
      })),
    );
    if (error) return { ok: false, error: "Gagal menyimpan daftar peserta." };
  }
  refresh(found.exam.quiz_id, examId);
  return { ok: true, added: fresh.length, skipped: entries.length - fresh.length, problems };
}

export async function removeRosterEntryAction(
  examId: string,
  entryId: string,
): Promise<ActionResult> {
  const found = await examOf(examId);
  if (!found || !id.safeParse(entryId).success) return { ok: false, error: "Tidak ditemukan." };
  const { error } = await found.supabase
    .from("session_roster")
    .delete()
    .eq("id", entryId)
    .eq("session_id", examId);
  if (error) return { ok: false, error: "Gagal menghapus." };
  refresh(found.exam.quiz_id, examId);
  return { ok: true };
}

const minutes = z.number().int().min(1).max(600);

export async function attemptAction(
  examId: string,
  attemptId: string,
  action:
    { kind: "extend"; minutes: number } | { kind: "reopen"; minutes: number } | { kind: "reset" },
): Promise<ActionResult> {
  const found = await examOf(examId);
  if (!found || !id.safeParse(attemptId).success) return { ok: false, error: "Tidak ditemukan." };
  const { supabase } = found;
  let error: { message: string } | null = null;
  if (action.kind === "reset") {
    ({ error } = await supabase.rpc("reset_attempt", { p_attempt_id: attemptId }));
  } else {
    const m = minutes.safeParse(action.minutes);
    if (!m.success) return { ok: false, error: "Jumlah menit tidak valid." };
    const rpc = action.kind === "extend" ? "extend_attempt" : "reopen_attempt";
    ({ error } = await supabase.rpc(rpc, { p_attempt_id: attemptId, p_minutes: m.data }));
  }
  if (error) {
    if (error.message.includes("attempt_closed"))
      return { ok: false, error: "Percobaan ini sudah selesai." };
    if (error.message.includes("attempt_open")) {
      return { ok: false, error: "Peserta masih punya percobaan yang berjalan." };
    }
    return { ok: false, error: "Gagal menyimpan." };
  }
  refresh(found.exam.quiz_id, examId);
  return { ok: true };
}

const gradeSchema = z.object({
  /** Rubric scores by criterion id; or a single percentage when the essay has no rubric. */
  rubric: z.record(z.string().max(40), z.number().min(0).max(100)).optional(),
  percent: z.number().min(0).max(100).optional(),
  feedback: z.string().max(2000),
});

export async function gradeResponseAction(
  examId: string,
  responseId: string,
  input: z.infer<typeof gradeSchema>,
): Promise<ActionResult<{ points: number }>> {
  const parsed = gradeSchema.safeParse(input);
  const found = await examOf(examId);
  if (!found || !parsed.success || !id.safeParse(responseId).success) {
    return { ok: false, error: "Isian tidak valid." };
  }
  const { supabase } = found;
  const { data: response } = await supabase
    .from("responses")
    .select("id, question_id, attempts!inner(session_id, quiz_version_id)")
    .eq("id", responseId)
    .eq("attempts.session_id", examId)
    .maybeSingle();
  if (!response) return { ok: false, error: "Jawaban tidak ditemukan." };

  const { data: version } = await supabase
    .from("quiz_versions")
    .select("snapshot")
    .eq("id", response.attempts.quiz_version_id)
    .maybeSingle();
  const question = parseSnapshot(version?.snapshot)?.questions.find(
    (q) => q.id === response.question_id,
  );
  if (!question) return { ok: false, error: "Soal tidak ditemukan." };

  // With a rubric the ratio follows from the criteria; otherwise from the percentage.
  const config = question.type === "essay" ? (question.config as EssayConfig) : null;
  const scores = parsed.data.rubric ?? {};
  const fromRubric = config && parsed.data.rubric ? rubricRatio(config.rubric, scores) : null;
  const ratio = fromRubric ?? (parsed.data.percent ?? 0) / 100;
  const rubric =
    config && parsed.data.rubric
      ? config.rubric.map((r) => ({
          id: r.id,
          criterion: r.criterion,
          score: Math.min(r.points, Math.max(0, scores[r.id] ?? 0)),
          max: r.points,
        }))
      : undefined;

  const { data, error } = await supabase.rpc("grade_response", {
    p_response_id: responseId,
    p_ratio: ratio,
    p_feedback: parsed.data.feedback,
    ...(rubric && { p_rubric: rubric as Json }),
  });
  if (error || !data) return { ok: false, error: "Gagal menyimpan nilai." };
  refresh(found.exam.quiz_id, examId);
  return { ok: true, points: data.points };
}
