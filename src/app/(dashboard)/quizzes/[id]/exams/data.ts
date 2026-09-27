import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { examPhase } from "@/engine/exam/attempt";
import { resolvePolicy } from "@/engine/policy";
import { parseSnapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Reads for the host's exam pages. They run as the host, so RLS keeps them to the
// host's own sessions; anything else is a 404.

const uuid = z.uuid();

/** The exam with its policy and pinned snapshot (cached per request: layout + page). */
export const loadHostExam = cache(async (quizId: string, examId: string) => {
  if (!uuid.safeParse(quizId).success || !uuid.safeParse(examId).success) notFound();
  const user = await requireHost(`/quizzes/${quizId}/exams/${examId}`);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, quiz_id, quiz_version_id, title, code, status, opens_at, closes_at, policy, results_released_at, created_at, quizzes!inner(title)",
    )
    .eq("id", examId)
    .eq("quiz_id", quizId)
    .eq("mode", "exam")
    .maybeSingle();
  if (!session?.quiz_version_id) notFound();
  const { data: version } = await supabase
    .from("quiz_versions")
    .select("snapshot")
    .eq("id", session.quiz_version_id)
    .maybeSingle();
  const snapshot = parseSnapshot(version?.snapshot);
  if (!snapshot) notFound();
  return {
    user,
    supabase,
    session,
    policy: resolvePolicy("exam", session.policy),
    snapshot,
    phase: examPhase(session),
  };
});

export type HostExam = Awaited<ReturnType<typeof loadHostExam>>;
type Supabase = HostExam["supabase"];

const PAGE = 1000;

/** Every row of a query, page by page (PostgREST caps a response at 1000 rows). */
async function all<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error("Gagal memuat data ujian.");
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

export async function loadParticipants(supabase: Supabase, examId: string) {
  return all((from, to) =>
    supabase
      .from("participants")
      .select("id, nickname, roster_id, user_id, joined_at, last_seen_at")
      .eq("session_id", examId)
      .order("joined_at")
      .range(from, to),
  );
}

export async function loadAttempts(supabase: Supabase, examId: string) {
  return all((from, to) =>
    supabase
      .from("attempts")
      .select(
        "id, participant_id, attempt_no, status, score, max_score, started_at, submitted_at, deadline, question_ids",
      )
      .eq("session_id", examId)
      .order("id")
      .range(from, to),
  );
}

export async function loadRoster(supabase: Supabase, examId: string) {
  return all((from, to) =>
    supabase
      .from("session_roster")
      .select("id, name, identifier, extra_time_pct, created_at")
      .eq("session_id", examId)
      .order("name")
      .range(from, to),
  );
}

/** Responses of the exam; `answer` only when asked for (it can be large). */
export async function loadResponses(supabase: Supabase, examId: string, withAnswers = false) {
  const columns = withAnswers
    ? "id, attempt_id, question_id, answer, correct, total, points, time_ms, feedback, rubric_scores, graded_at, attempts!inner(session_id)"
    : "id, attempt_id, question_id, correct, total, points, time_ms, attempts!inner(session_id)";
  const rows = await all((from, to) =>
    supabase
      .from("responses")
      .select(columns)
      .eq("attempts.session_id", examId)
      .order("id")
      .range(from, to),
  );
  return rows as unknown as {
    id: string;
    attempt_id: string;
    question_id: string;
    answer?: unknown;
    correct: number | null;
    total: number | null;
    points: number;
    time_ms: number | null;
    feedback?: string | null;
    rubric_scores?: unknown;
    graded_at?: string | null;
  }[];
}

export async function loadIntegrity(supabase: Supabase, examId: string) {
  return all((from, to) =>
    supabase
      .from("integrity_events")
      .select("id, attempt_id, kind, meta, at, attempts!inner(session_id)")
      .eq("attempts.session_id", examId)
      .order("id")
      .range(from, to),
  );
}

/** Group rows by a key. */
export function groupBy<T, K>(rows: T[], key: (row: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const row of rows) {
    const k = key(row);
    const list = out.get(k);
    if (list) list.push(row);
    else out.set(k, [row]);
  }
  return out;
}
