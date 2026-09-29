import "server-only";

import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { itemAnalysis, toCsv, type ItemStat } from "@/engine/exam/report";
import {
  leaderboardReplay,
  liveStandings,
  type LiveResponse,
  type LiveStandingRow,
} from "@/engine/live/report";
import { parseSnapshot } from "@/engine/practice/snapshot";
import { requireHost } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { GAME_MODES } from "@/engine/live/types";

import { all } from "../../exams/data";

const uuid = z.uuid();

/** Everything the live report and its CSV exports show (P5-18). Runs as the host (RLS). */
export const buildLiveReport = cache(async (quizId: string, sessionId: string) => {
  if (!uuid.safeParse(quizId).success || !uuid.safeParse(sessionId).success) notFound();
  const user = await requireHost(`/quizzes/${quizId}/live/${sessionId}`);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("sessions")
    .select(
      "id, mode, quiz_id, quiz_version_id, phase, created_at, question_ids, quizzes!inner(title)",
    )
    .eq("id", sessionId)
    .eq("quiz_id", quizId)
    .in("mode", GAME_MODES)
    .maybeSingle();
  if (!session?.quiz_version_id) notFound();

  const battle = session.mode !== "live";
  const [{ data: version }, participants, rounds, rows, battleRows, winners] = await Promise.all([
    supabase
      .from("quiz_versions")
      .select("snapshot")
      .eq("id", session.quiz_version_id)
      .maybeSingle(),
    all((from, to) =>
      supabase
        .from("participants")
        .select("id, nickname, kicked_at, is_spectator")
        .eq("session_id", sessionId)
        .order("joined_at")
        .range(from, to),
    ),
    all((from, to) =>
      supabase
        .from("battle_rounds")
        .select("idx, question_id, opened_at")
        .eq("session_id", sessionId)
        .order("idx")
        .range(from, to),
    ),
    battle
      ? Promise.resolve([])
      : all((from, to) =>
          supabase
            .from("responses")
            .select(
              "id, question_id, answer, correct, total, points, time_ms, attempts!inner(session_id, participant_id)",
            )
            .eq("attempts.session_id", sessionId)
            .order("id")
            .range(from, to),
        ),
    // Rebutan keeps its answers per round (docs/10).
    battle
      ? all((from, to) =>
          supabase
            .from("battle_answers")
            .select(
              "id, participant_id, answer, correct, points, reaction_ms, battle_rounds!inner(session_id, question_id)",
            )
            .eq("battle_rounds.session_id", sessionId)
            .order("id")
            .range(from, to),
        )
      : Promise.resolve([]),
    battle
      ? all((from, to) =>
          supabase
            .from("round_winners")
            .select("participant_id, battle_rounds!inner(session_id)")
            .eq("battle_rounds.session_id", sessionId)
            .range(from, to),
        )
      : Promise.resolve([]),
  ]);
  const snapshot = parseSnapshot(version?.snapshot);
  if (!snapshot) notFound();

  const players = participants
    .filter((p) => !p.kicked_at && !p.is_spectator)
    .map((p) => ({ id: p.id, nickname: p.nickname }));
  const playerIds = new Set(players.map((p) => p.id));
  const responses: (LiveResponse & { answer: unknown })[] = battle
    ? battleRows
        .filter((r) => playerIds.has(r.participant_id))
        .map((r) => ({
          participantId: r.participant_id,
          questionId: r.battle_rounds.question_id,
          answer: r.answer,
          correct: r.correct ? 1 : 0,
          total: 1,
          points: r.points,
          timeMs: r.reaction_ms,
        }))
    : rows
        .filter((r) => playerIds.has(r.attempts.participant_id))
        .map((r) => ({
          participantId: r.attempts.participant_id,
          questionId: r.question_id,
          answer: r.answer,
          correct: r.correct,
          total: r.total,
          points: r.points,
          timeMs: r.time_ms,
        }));
  const wins = new Map<string, number>();
  for (const w of winners) wins.set(w.participant_id, (wins.get(w.participant_id) ?? 0) + 1);
  // Rounds that actually opened, in the order they were played.
  const played = rounds.filter((r) => r.opened_at).map((r) => r.question_id);

  const standings: LiveStandingRow[] = liveStandings(players, responses, played).map((row) =>
    battle ? { ...row, wins: wins.get(row.id) ?? 0 } : row,
  );
  const replay = leaderboardReplay(players, responses, played);
  const byId = new Map(snapshot.questions.map((q) => [q.id, q]));
  const questions = played.map((id) => byId.get(id)).filter((q) => !!q);
  const items: ItemStat[] = itemAnalysis(
    questions,
    responses.map((r) => ({
      questionId: r.questionId,
      answer: r.answer,
      correct: r.correct,
      total: r.total,
      timeMs: r.timeMs,
    })),
  );

  return {
    user,
    session,
    title: session.quizzes.title || snapshot.quiz.title,
    battle,
    standings,
    replay: replay.map((frame) => ({
      ...frame,
      prompt: byId.get(frame.questionId)?.prompt ?? "",
    })),
    items,
    questionCount: session.question_ids?.length ?? 0,
  };
});

export function standingsCsv(rows: LiveStandingRow[]): string {
  return toCsv([
    [
      "Peringkat",
      "Nama",
      "Skor",
      "Soal dimenangkan",
      "Benar",
      "Dijawab",
      "Ketepatan (%)",
      "Rata-rata waktu (detik)",
    ],
    ...rows.map((r) => [
      r.rank,
      r.nickname,
      r.score,
      r.wins ?? null,
      r.correct,
      r.answered,
      r.accuracy,
      r.avgTimeMs === null ? null : Math.round(r.avgTimeMs / 100) / 10,
    ]),
  ]);
}
