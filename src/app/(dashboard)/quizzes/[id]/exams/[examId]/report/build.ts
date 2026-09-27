import "server-only";

import { describeIntegrity, summarizeIntegrity } from "@/engine/exam/integrity";
import { finalPercent, itemAnalysis, percentOf, toCsv, type ItemStat } from "@/engine/exam/report";
import { formatDuration } from "@/lib/format";

import {
  groupBy,
  loadAttempts,
  loadHostExam,
  loadIntegrity,
  loadParticipants,
  loadResponses,
  loadRoster,
} from "../../data";

export type ReportRow = {
  participantId: string;
  name: string;
  identifier: string | null;
  attempts: number;
  status: "in_progress" | "submitted" | "expired";
  /** The percentage that counts (policy.attemptScoring); null until one is finished. */
  percent: number | null;
  duration: string | null;
  pending: number;
  integrity: string;
  integrityCount: number;
};

/** Everything the report page and its CSV exports show (docs/08 · Laporan ujian). */
export async function buildReport(quizId: string, examId: string) {
  const exam = await loadHostExam(quizId, examId);
  const { supabase, snapshot, policy } = exam;
  const [participants, attempts, responses, events, roster] = await Promise.all([
    loadParticipants(supabase, examId),
    loadAttempts(supabase, examId),
    loadResponses(supabase, examId, true),
    loadIntegrity(supabase, examId),
    loadRoster(supabase, examId),
  ]);

  const rosterById = new Map(roster.map((r) => [r.id, r]));
  const attemptsOf = groupBy(attempts, (a) => a.participant_id);
  const responsesOf = groupBy(responses, (r) => r.attempt_id);
  const eventsOf = groupBy(events, (e) => e.attempt_id);
  const final = finalPercent(
    attempts.map((a) => ({
      participantId: a.participant_id,
      attemptNo: a.attempt_no,
      status: a.status,
      percent: percentOf(a.score, a.max_score),
    })),
    policy.attemptScoring,
  );

  const rows: ReportRow[] = participants
    .filter((p) => attemptsOf.has(p.id))
    .map((p) => {
      const mine = attemptsOf.get(p.id)!.sort((a, b) => a.attempt_no - b.attempt_no);
      const latest = mine.at(-1)!;
      const myEvents = mine.flatMap((a) => eventsOf.get(a.id) ?? []);
      const summary = summarizeIntegrity(
        myEvents.map((e) => ({ kind: e.kind, meta: e.meta as { durationMs?: number } | null })),
      );
      return {
        participantId: p.id,
        name: p.nickname,
        identifier: p.roster_id ? (rosterById.get(p.roster_id)?.identifier ?? null) : null,
        attempts: mine.length,
        status: latest.status,
        percent: final.get(p.id) ?? null,
        duration: latest.submitted_at
          ? formatDuration(latest.started_at, latest.submitted_at)
          : null,
        pending: mine
          .filter((a) => a.status !== "in_progress")
          .flatMap((a) => responsesOf.get(a.id) ?? [])
          .filter((r) => r.correct === null).length,
        integrity: describeIntegrity(summary),
        integrityCount: summary.reduce((s, x) => s + x.count, 0),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "id"));

  // Item analysis over finished attempts, for every question someone was given.
  const finished = attempts.filter((a) => a.status !== "in_progress");
  const given = new Set(finished.flatMap((a) => a.question_ids));
  const finishedIds = new Set(finished.map((a) => a.id));
  // Numbered as in the quiz (like the grading page), then trimmed to the questions used.
  const items: ItemStat[] = itemAnalysis(
    snapshot.questions,
    responses
      .filter((r) => finishedIds.has(r.attempt_id))
      .map((r) => ({
        questionId: r.question_id,
        answer: r.answer,
        correct: r.correct,
        total: r.total,
        timeMs: r.time_ms,
      })),
  ).filter((item) => given.has(item.questionId));

  const scored = rows.filter((r) => r.percent !== null);
  const stats = {
    participants: rows.length,
    finished: rows.filter((r) => r.status !== "in_progress").length,
    average: scored.length
      ? Math.round(scored.reduce((s, r) => s + r.percent!, 0) / scored.length)
      : null,
    pending: rows.reduce((s, r) => s + r.pending, 0),
  };

  return { exam, rows, items, stats };
}

const STATUS_TEXT = { in_progress: "Mengerjakan", submitted: "Selesai", expired: "Waktu habis" };

export function scoresCsv(rows: ReportRow[]): string {
  return toCsv([
    [
      "Nama",
      "NIS/Email",
      "Percobaan",
      "Status",
      "Nilai (%)",
      "Durasi",
      "Esai belum dinilai",
      "Catatan integritas",
    ],
    ...rows.map((r) => [
      r.name,
      r.identifier,
      r.attempts,
      STATUS_TEXT[r.status],
      r.percent,
      r.duration,
      r.pending,
      r.integrity,
    ]),
  ]);
}

export function itemsCsv(items: ItemStat[]): string {
  return toCsv([
    [
      "No",
      "Soal",
      "Tipe",
      "Dijawab",
      "Benar (%)",
      "Rata-rata waktu (detik)",
      "Belum dinilai",
      "Perlu dicek",
      "Distribusi pilihan",
    ],
    ...items.map((item) => [
      item.number,
      item.prompt,
      item.typeLabel,
      item.answered,
      item.percentCorrect,
      item.avgTimeMs === null ? null : Math.round(item.avgTimeMs / 1000),
      item.pending,
      item.flagged ? "Ya" : "",
      item.options?.map((o) => `${o.label}: ${o.count}${o.correct ? " (kunci)" : ""}`).join("; "),
    ]),
  ]);
}
