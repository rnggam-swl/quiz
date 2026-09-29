import { resolvePolicy, type Policy } from "@/engine/policy";
import { storedResult, toPlayQuestion } from "@/engine/practice/attempt";
import type { Snapshot } from "@/engine/practice/snapshot";

import type {
  HostView,
  LivePhase,
  LiveReveal,
  LiveView,
  PlayerView,
  RawLiveState,
  RosterEntry,
} from "./types";

/**
 * Turn live_state() into what a screen may see. The answer key is added only once the
 * round is locked (reveal), and a participant's own result only from then on — before
 * that a phone knows nothing more than "you answered".
 */

const SHOWS_QUESTION: ReadonlySet<LivePhase> = new Set(["countdown", "open", "reveal"]);
const RESULTS_OUT: ReadonlySet<LivePhase> = new Set(["reveal", "leaderboard", "podium", "ended"]);

export type LiveAnswer = { answer: unknown; correct: number | null; total: number | null };

/** Picks per choice for the reveal bars (keys as in choiceKey). */
export function choiceCounts(
  type: string,
  answers: LiveAnswer[],
): Record<string, number> | undefined {
  if (type !== "multiple_choice" && type !== "true_false" && type !== "odd_one_out")
    return undefined;
  const counts: Record<string, number> = {};
  const add = (key: unknown) => {
    if (typeof key === "string" || typeof key === "boolean")
      counts[String(key)] = (counts[String(key)] ?? 0) + 1;
  };
  for (const { answer } of answers) {
    const a = (answer ?? {}) as { selectedIds?: unknown; selectedId?: unknown; value?: unknown };
    if (type === "multiple_choice" && Array.isArray(a.selectedIds)) a.selectedIds.forEach(add);
    else if (type === "odd_one_out") add(a.selectedId);
    else if (type === "true_false") add(a.value);
  }
  return counts;
}

export function livePolicy(raw: Pick<RawLiveState, "policy">): Policy {
  return resolvePolicy("live", raw.policy);
}

function baseView(
  raw: RawLiveState,
  snapshot: Snapshot,
  answers: LiveAnswer[] | null,
  now: number,
): LiveView {
  const policy = livePolicy(raw);
  const q = raw.questionId ? snapshot.questions.find((x) => x.id === raw.questionId) : undefined;
  let reveal: LiveReveal | null = null;
  if (raw.phase === "reveal" && q) {
    reveal = { config: q.config, explanation: q.explanation };
    if (answers) {
      const graded = answers.filter((a) => a.correct !== null && a.total !== null);
      const right = graded.filter(
        (a) => Number(a.total) > 0 && Number(a.correct) >= Number(a.total),
      );
      reveal.correct = right.length;
      reveal.wrong = answers.length - right.length;
      const counts = choiceCounts(q.type, answers);
      if (counts) reveal.counts = counts;
    }
  }
  return {
    sessionId: raw.sessionId,
    mode: raw.mode ?? "live",
    title: snapshot.quiz.title,
    version: raw.version,
    phase: raw.phase,
    round: raw.round,
    questionCount: raw.questionCount,
    phaseClosesAt: raw.phaseClosesAt,
    timeLimitMs: raw.timeLimitMs,
    paused: raw.paused,
    pausedRemainingMs: raw.pausedRemainingMs,
    players: raw.players,
    answered: raw.answered,
    question:
      q && SHOWS_QUESTION.has(raw.phase) ? toPlayQuestion(q, Number(raw.seed ?? 0), policy) : null,
    reveal,
    winner: raw.winner ?? null,
    top: raw.top ?? [],
    serverNow: new Date(now).toISOString(),
  };
}

/**
 * While the round is open, a participant's score, rank and streak are shown as they were
 * before it: the new numbers would tell them whether they got it right.
 */
/** The part of the state every phone shares (what the server signs and broadcasts). */
export function sharedView(raw: RawLiveState, snapshot: Snapshot, now = Date.now()): LiveView {
  return baseView(raw, snapshot, null, now);
}

export function playerView(
  raw: RawLiveState,
  snapshot: Snapshot,
  now = Date.now(),
): PlayerView | null {
  const you = raw.you;
  if (!you) return null;
  const mine = you.answer;
  // Rebutan answers get their verdict at once (one chance: wrong = locked out, right =
  // the round is over), so only live keeps it until the reveal.
  const out = RESULTS_OUT.has(raw.phase) || (raw.mode ?? "live") !== "live";
  const hide = !out && !!mine;
  return {
    ...baseView(raw, snapshot, null, now),
    you: {
      id: you.id,
      nickname: you.nickname,
      score: hide ? you.score - mine.points : you.score,
      rank: hide ? null : you.rank,
      streak: hide ? null : you.streak,
      kicked: you.kicked,
      spectator: you.spectator,
      answered: !!mine,
      answer: mine?.answer ?? null,
      result:
        mine && out
          ? { ratio: storedResult(mine.correct, mine.total)?.ratio ?? 0, points: mine.points }
          : null,
    },
  };
}

export function hostView(
  raw: RawLiveState,
  snapshot: Snapshot,
  { roster = [], answers = null }: { roster?: RosterEntry[]; answers?: LiveAnswer[] | null } = {},
  now = Date.now(),
): HostView {
  return {
    ...baseView(raw, snapshot, answers, now),
    code: raw.code,
    lobbyLocked: raw.lobbyLocked,
    autoAdvance: raw.autoAdvance,
    roster,
  };
}
