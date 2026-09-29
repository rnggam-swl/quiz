import type { Standing } from "./types";

/** Live session report (P5-18): final standings and the leaderboard after each question. */

export type LiveResponse = {
  participantId: string;
  questionId: string;
  correct: number | null;
  total: number | null;
  points: number;
  timeMs: number | null;
};

export type LivePlayer = { id: string; nickname: string };

export type LiveStandingRow = {
  id: string;
  nickname: string;
  rank: number;
  score: number;
  /** Questions answered with full credit. */
  correct: number;
  answered: number;
  /** Mean credit over the questions played, 0–100. */
  accuracy: number;
  avgTimeMs: number | null;
  /** Rebutan: questions won. */
  wins?: number;
  /** Royale: lives left, the round they went out in (null = survived), shadow points. */
  lives?: number;
  eliminatedRound?: number | null;
  shadowScore?: number;
};

const ratio = (r: LiveResponse) =>
  r.total && Number(r.total) > 0
    ? Math.min(1, Math.max(0, Number(r.correct ?? 0) / Number(r.total)))
    : 0;

/** Competition ranking (1, 2, 2, 4) by score; ties share a rank. */
function ranked<T extends { score: number; nickname: string }>(
  rows: T[],
): (T & { rank: number })[] {
  const sorted = [...rows].sort(
    (a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname),
  );
  return sorted.map((row) => ({
    ...row,
    rank: 1 + sorted.filter((o) => o.score > row.score).length,
  }));
}

export function liveStandings(
  players: LivePlayer[],
  responses: LiveResponse[],
  /** Questions that were played (rounds that opened). */
  playedIds: string[],
): LiveStandingRow[] {
  const played = new Set(playedIds);
  const mine = new Map<string, LiveResponse[]>();
  for (const r of responses) {
    if (!played.has(r.questionId)) continue;
    mine.set(r.participantId, [...(mine.get(r.participantId) ?? []), r]);
  }
  return ranked(
    players.map((p) => {
      const list = mine.get(p.id) ?? [];
      const timed = list.filter((r) => r.timeMs !== null);
      return {
        id: p.id,
        nickname: p.nickname,
        score: list.reduce((s, r) => s + r.points, 0),
        correct: list.filter((r) => ratio(r) >= 1).length,
        answered: list.length,
        accuracy: played.size
          ? Math.round((list.reduce((s, r) => s + ratio(r), 0) / played.size) * 100)
          : 0,
        avgTimeMs: timed.length
          ? Math.round(timed.reduce((s, r) => s + Number(r.timeMs), 0) / timed.length)
          : null,
      };
    }),
  );
}

export type ReplayFrame = { round: number; questionId: string; top: Standing[] };

/** The top `size` after each round, with the points won in it and the rank before it. */
export function leaderboardReplay(
  players: LivePlayer[],
  responses: LiveResponse[],
  roundQuestionIds: string[],
  size = 5,
): ReplayFrame[] {
  const pointsIn = new Map<string, Map<string, number>>();
  for (const r of responses) {
    const byPlayer = pointsIn.get(r.questionId) ?? new Map<string, number>();
    byPlayer.set(r.participantId, (byPlayer.get(r.participantId) ?? 0) + r.points);
    pointsIn.set(r.questionId, byPlayer);
  }
  const totals = new Map(players.map((p) => [p.id, 0]));
  return roundQuestionIds.map((questionId, round) => {
    const before = ranked(players.map((p) => ({ ...p, score: totals.get(p.id) ?? 0 })));
    const prevRank = new Map(before.map((r) => [r.id, r.rank]));
    const won = pointsIn.get(questionId) ?? new Map<string, number>();
    for (const p of players) totals.set(p.id, (totals.get(p.id) ?? 0) + (won.get(p.id) ?? 0));
    const after = ranked(players.map((p) => ({ ...p, score: totals.get(p.id) ?? 0 })));
    return {
      round,
      questionId,
      top: after.slice(0, size).map((r) => ({
        id: r.id,
        nickname: r.nickname,
        score: r.score,
        delta: won.get(r.id) ?? 0,
        rank: r.rank,
        prevRank: prevRank.get(r.id) ?? r.rank,
      })),
    };
  });
}
