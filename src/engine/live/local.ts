import type { Policy } from "@/engine/policy";
import { gradeAnswer } from "@/engine/practice/attempt";
import { nicknameSchema } from "@/engine/practice/nickname";
import type { Snapshot } from "@/engine/practice/snapshot";
import type { PlayError } from "@/engine/practice/types";
import type { MemoryHub } from "@/engine/transport/memory";
import { generateSigningKeys } from "@/engine/transport/signing";
import { createRandom, randomSeed } from "@/lib/seed-random";

import { liveQuestionOrder } from "./form";
import { signState } from "./signed";
import {
  ANSWER_GRACE_MS,
  COUNTDOWN_MS,
  LEADERBOARD_MS,
  nextStreak,
  REVEAL_MS,
  speedPoints,
  streakBonus,
} from "./scoring";
import type {
  BattleOutcome,
  GameMode,
  HostAction,
  LiveHostAdapter,
  LivePhase,
  LivePlayerAdapter,
  RawLiveState,
  Standing,
} from "./types";
import { hostView, playerView, sharedView } from "./view";

type LocalAnswer = {
  answer: unknown;
  correct: number;
  total: number;
  points: number;
  timeMs: number;
};

type LocalPlayer = {
  id: string;
  nickname: string;
  score: number;
  streak: number;
  kicked: boolean;
  spectator: boolean;
  joinedAt: number;
  wins: number;
  answers: Map<string, LocalAnswer>;
};

type Round = {
  questionId: string;
  limitMs: number;
  openedAt: number | null;
  closesAt: number | null;
  /** Rebutan: who answered right first. */
  winner: string | null;
};

/**
 * An in-memory live session with the same rules as advance_live / record_live_answer
 * (supabase/migrations/…_live.sql): for the playground, where one page plays the
 * projector and a few phones, plus bots that answer by themselves.
 */
export function createLocalLive(
  snapshot: Snapshot,
  policy: Policy,
  {
    hub,
    sessionId = "playground-live",
    code = "123456",
    latencyMs = 120,
    mode = "live",
  }: { hub: MemoryHub; sessionId?: string; code?: string; latencyMs?: number; mode?: GameMode },
) {
  const seed = randomSeed();
  const questionIds = liveQuestionOrder(snapshot, policy, seed, mode);
  const players = new Map<string, LocalPlayer>();
  const tokens = new Map<string, string>();
  const bots = new Map<string, number>();
  const rounds: Round[] = [];
  const s = {
    version: 0,
    phase: "lobby" as LivePhase,
    round: null as number | null,
    phaseOpenedAt: Date.now(),
    phaseClosesAt: null as number | null,
    pausedAt: null as number | null,
    pausedRemaining: null as number | null,
    lobbyLocked: false,
    autoAdvance: policy.autoAdvance,
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, latencyMs));
  // Signed like the server's broadcasts, so the playground runs the real phone path.
  const keys = generateSigningKeys();
  const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
  const active = () => [...players.values()].filter((p) => !p.kicked && !p.spectator);
  const current = () => (s.round === null ? undefined : rounds[s.round]);

  function bump(kicked?: string[]) {
    s.version++;
    const version = s.version;
    const view = sharedView(raw(), snapshot);
    void keys
      .then(({ privateKey }) => signState(privateKey, { view, ...(kicked && { kicked }) }))
      .then((signed) => hub.broadcast(sessionId, { type: "state", version, signed }));
  }

  function setPhase(phase: LivePhase, closesInMs: number | null) {
    const now = Date.now();
    s.phase = phase;
    s.phaseOpenedAt = now;
    s.phaseClosesAt = closesInMs === null ? null : now + closesInMs;
    s.pausedAt = null;
    s.pausedRemaining = null;
  }

  function standings(): Standing[] {
    const round = current();
    const rows = active().map((p) => {
      const delta = round ? (p.answers.get(round.questionId)?.points ?? 0) : 0;
      return { id: p.id, nickname: p.nickname, score: p.score, delta, wins: p.wins };
    });
    const rankBy = (value: (r: (typeof rows)[number]) => number) => (r: (typeof rows)[number]) =>
      1 + rows.filter((o) => value(o) > value(r)).length;
    const rank = rankBy((r) => r.score);
    const prevRank = rankBy((r) => r.score - r.delta);
    return rows
      .map((r) => ({ ...r, rank: rank(r), prevRank: prevRank(r) }))
      .sort((a, b) => a.rank - b.rank || a.nickname.localeCompare(b.nickname))
      .slice(0, 5);
  }

  function raw(participantId?: string): RawLiveState {
    const round = current();
    const you = participantId ? players.get(participantId) : undefined;
    const mine = you && round ? you.answers.get(round.questionId) : undefined;
    const winner = round?.winner ? players.get(round.winner) : undefined;
    return {
      sessionId,
      mode,
      roundId: s.round === null ? null : `local-round-${s.round}`,
      winner: winner ? { id: winner.id, nickname: winner.nickname } : null,
      versionId: "local",
      seed,
      policy,
      code,
      version: s.version,
      phase: s.phase,
      round: s.round,
      questionCount: questionIds.length,
      questionId: round?.questionId ?? null,
      phaseOpenedAt: iso(s.phaseOpenedAt),
      phaseClosesAt: iso(s.phaseClosesAt),
      roundOpenedAt: iso(round?.openedAt ?? null),
      roundClosesAt: iso(round?.closesAt ?? null),
      timeLimitMs: round?.limitMs ?? null,
      paused: s.pausedAt !== null,
      pausedRemainingMs: s.pausedRemaining,
      lobbyLocked: s.lobbyLocked,
      autoAdvance: s.autoAdvance,
      players: active().length,
      answered: round
        ? [...players.values()].filter((p) => !p.kicked && p.answers.has(round.questionId)).length
        : 0,
      top: ["leaderboard", "podium", "ended"].includes(s.phase) ? standings() : [],
      ...(you && {
        you: {
          id: you.id,
          nickname: you.nickname,
          score: you.score,
          streak: you.streak,
          kicked: you.kicked,
          spectator: you.spectator,
          rank: 1 + active().filter((o) => o.score > you.score).length,
          answer: mine ? { ...mine } : null,
        },
      }),
    };
  }

  function hostSnapshot() {
    const r = raw();
    const round = current();
    return hostView(r, snapshot, {
      roster:
        s.phase === "lobby"
          ? active()
              .sort((a, b) => a.joinedAt - b.joinedAt)
              .map((p) => ({ id: p.id, nickname: p.nickname }))
          : [],
      answers:
        s.phase === "reveal" && round
          ? [...players.values()]
              .filter((p) => !p.kicked)
              .flatMap((p) => {
                const a = p.answers.get(round.questionId);
                return a ? [{ answer: a.answer, correct: a.correct, total: a.total }] : [];
              })
          : null,
    });
  }

  type Recorded = { error: PlayError } | { outcome?: BattleOutcome };

  function record(p: LocalPlayer, questionId: string, raw: unknown): Recorded {
    const round = current();
    if (s.phase !== "open" || !round || round.questionId !== questionId || round.openedAt === null)
      return { error: "round_closed" };
    if (round.closesAt !== null && Date.now() > round.closesAt + ANSWER_GRACE_MS)
      return { error: "deadline_passed" };
    if (p.answers.has(questionId)) return { error: "already_answered" };
    const q = snapshot.questions.find((x) => x.id === questionId)!;
    const graded = gradeAnswer(q, raw);
    if (!graded) return { error: "invalid" };
    const correct = graded.result?.correct ?? 0;
    const total = graded.result?.total ?? 0;
    const ratio = total > 0 ? Math.min(1, correct / total) : 0;
    const elapsed = Math.max(
      0,
      Math.min(round.limitMs, (s.pausedAt ?? Date.now()) - round.openedAt),
    );
    if (mode === "battle_buzzer") {
      return buzz(p, round, q.points, graded.answer, ratio >= 1, elapsed);
    }
    const streak = nextStreak(p.streak, ratio, total);
    const bonus = total > 0 && ratio >= 1 ? streakBonus(streak) : 0;
    const points = speedPoints(q.points, ratio, elapsed, round.limitMs) + bonus;
    p.answers.set(questionId, { answer: graded.answer, correct, total, points, timeMs: elapsed });
    p.score += points;
    p.streak = streak;
    return {};
  }

  /** Rebutan, as record_battle_answer: the first right answer wins and ends the round. */
  function buzz(
    p: LocalPlayer,
    round: Round,
    basePoints: number,
    answer: unknown,
    correct: boolean,
    timeMs: number,
  ): Recorded {
    let points: number;
    if (correct) {
      points = basePoints;
      round.winner = p.id;
      p.score += points;
      p.wins++;
      p.streak++;
      for (const other of players.values()) if (other !== p) other.streak = 0;
    } else {
      points = -Math.min(policy.buzzer.wrongPenalty, p.score) || 0; // no -0
      p.score += points;
      p.streak = 0;
    }
    p.answers.set(round.questionId, { answer, correct: correct ? 1 : 0, total: 1, points, timeMs });
    if (correct) {
      setPhase("reveal", REVEAL_MS);
      bump();
    }
    return { outcome: { won: correct, correct, points } };
  }

  /** Bots answer choice questions after a random delay, right `skill` of the time. */
  function scheduleBots(questionId: string, limitMs: number) {
    const q = snapshot.questions.find((x) => x.id === questionId)!;
    const config = q.config as Record<string, unknown>;
    for (const [id, skill] of bots) {
      const p = players.get(id);
      if (!p || p.kicked) continue;
      const random = createRandom(seed ^ id.length ^ Math.floor(Math.random() * 1e9));
      let answer: unknown = null;
      if (q.type === "true_false") {
        answer = { value: random() < skill ? config.correct : !config.correct };
      } else if (q.type === "multiple_choice") {
        const options = config.options as { id: string }[];
        const correctIds = config.correctIds as string[];
        const wrong = options.filter((o) => !correctIds.includes(o.id));
        answer = {
          selectedIds:
            random() < skill || wrong.length === 0
              ? correctIds
              : [wrong[Math.floor(random() * wrong.length)]!.id],
        };
      } else if (q.type === "odd_one_out") {
        const items = config.items as { id: string }[];
        const others = items.filter((i) => i.id !== config.oddId);
        answer = {
          selectedId:
            random() < skill ? config.oddId : others[Math.floor(random() * others.length)]!.id,
        };
      }
      if (answer === null || random() < 0.1) continue; // some bots don't answer
      setTimeout(() => void record(p, questionId, answer), 800 + random() * limitMs * 0.7);
    }
  }

  function advance(version: number, action: HostAction) {
    if (version !== s.version || s.phase === "ended") return;
    const now = Date.now();
    const round = current();

    if (action === "pause") {
      if (s.pausedAt !== null || s.phase === "lobby" || s.phase === "podium") return;
      s.pausedRemaining = s.phaseClosesAt === null ? null : Math.max(0, s.phaseClosesAt - now);
      s.pausedAt = now;
      s.phaseClosesAt = null;
      if (round && s.phase === "open") round.closesAt = null;
      return bump();
    }
    if (action === "resume") {
      if (s.pausedAt === null) return;
      const closes = s.pausedRemaining === null ? null : now + s.pausedRemaining;
      if (round && s.phase === "open" && round.openedAt !== null) {
        round.openedAt += now - s.pausedAt;
        round.closesAt = closes;
      }
      s.phaseClosesAt = closes;
      s.pausedAt = null;
      s.pausedRemaining = null;
      return bump();
    }
    if (
      action === "auto" &&
      (s.pausedAt !== null || s.phaseClosesAt === null || now < s.phaseClosesAt)
    )
      return;
    if (action === "end") {
      setPhase(s.phase === "lobby" || s.phase === "podium" ? "ended" : "podium", null);
      return bump();
    }

    const count = questionIds.length;
    if (s.phase === "lobby" || (s.phase === "leaderboard" && s.round! + 1 < count)) {
      const idx = s.phase === "lobby" ? 0 : s.round! + 1;
      const q = snapshot.questions.find((x) => x.id === questionIds[idx])!;
      const limitS = q.timeLimitS ?? policy.timer.perQuestionS ?? 20;
      rounds[idx] = {
        questionId: q.id,
        limitMs: limitS * 1000,
        openedAt: null,
        closesAt: null,
        winner: null,
      };
      s.round = idx;
      setPhase("countdown", COUNTDOWN_MS);
    } else if (s.phase === "countdown") {
      const r = round!;
      r.openedAt = now;
      r.closesAt = now + r.limitMs;
      setPhase("open", r.limitMs);
      scheduleBots(r.questionId, r.limitMs);
    } else if (s.phase === "open") {
      for (const p of players.values()) if (!p.answers.has(round!.questionId)) p.streak = 0;
      setPhase("reveal", REVEAL_MS);
    } else if (s.phase === "reveal") {
      setPhase("leaderboard", LEADERBOARD_MS);
    } else if (s.phase === "leaderboard") {
      setPhase("podium", null);
    } else if (s.phase === "podium") {
      setPhase("ended", null);
    }
    bump();
  }

  function join(nickname: string, spectatorOk = true): LocalPlayer | string {
    if (s.phase === "podium" || s.phase === "ended") return "session_closed";
    if (s.lobbyLocked) return "lobby_locked";
    const late = s.phase !== "lobby";
    if (late && policy.lateJoin === "deny") return "late_join_closed";
    let name = nickname;
    for (
      let n = 2;
      [...players.values()].some((p) => p.nickname.toLowerCase() === name.toLowerCase());
      n++
    ) {
      name = `${nickname.slice(0, 24 - ` ${n}`.length)} ${n}`;
    }
    const p: LocalPlayer = {
      id: crypto.randomUUID(),
      nickname: name,
      score: 0,
      streak: 0,
      kicked: false,
      spectator: late && policy.lateJoin === "spectator" && spectatorOk,
      joinedAt: Date.now(),
      wins: 0,
      answers: new Map(),
    };
    players.set(p.id, p);
    return p;
  }

  const host: LiveHostAdapter = {
    async state() {
      await wait();
      return { ok: true, view: hostSnapshot() };
    },
    async advance(version, action) {
      await wait();
      advance(version, action);
      return { ok: true, view: hostSnapshot() };
    },
    async settings(patch) {
      await wait();
      if (typeof patch.lobbyLocked === "boolean") s.lobbyLocked = patch.lobbyLocked;
      if (typeof patch.autoAdvance === "boolean") s.autoAdvance = patch.autoAdvance;
      bump();
      return { ok: true, view: hostSnapshot() };
    },
    async kick(participantId) {
      await wait();
      const p = players.get(participantId);
      if (p) p.kicked = true;
      bump([participantId]);
      return { ok: true, view: hostSnapshot() };
    },
  };

  const player: LivePlayerAdapter = {
    async join(nickname) {
      await wait();
      const parsed = nicknameSchema.safeParse(nickname);
      if (!parsed.success) return { ok: false, error: "invalid" };
      const p = join(parsed.data);
      if (typeof p === "string") return { ok: false, error: p as "session_closed" };
      const token = crypto.randomUUID();
      tokens.set(token, p.id);
      return { ok: true, token, nickname: p.nickname };
    },
    async state(token) {
      await wait();
      const id = tokens.get(token);
      const view = id ? playerView(raw(id), snapshot) : null;
      return view ? { ok: true, view } : { ok: false, error: "unauthorized" };
    },
    async answer(token, questionId, answer) {
      await wait();
      const p = players.get(tokens.get(token) ?? "");
      if (!p) return { ok: false, error: "unauthorized" };
      if (p.kicked) return { ok: false, error: "kicked" };
      if (p.spectator) return { ok: false, error: "spectator" };
      const recorded = record(p, questionId, answer);
      return "error" in recorded ? { ok: false, error: recorded.error } : { ok: true, ...recorded };
    },
  };

  return {
    host,
    player,
    code,
    sessionId,
    publicKey: keys.then((k) => k.publicKey),
    /** A simulated participant (presence included) who answers choice questions. */
    addBot(nickname: string, skill = 0.7) {
      const p = join(nickname, false);
      if (typeof p === "string") return;
      bots.set(p.id, skill);
      hub.open(sessionId).track({ key: p.id, nickname: p.nickname, role: "player" });
    },
  };
}

export type LocalLive = ReturnType<typeof createLocalLive>;
