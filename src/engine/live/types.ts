import type { PlayQuestion, Result } from "@/engine/practice/types";

/** docs/09-mode-live.md · State machine. */
export const LIVE_PHASES = [
  "lobby",
  "countdown",
  "open",
  "reveal",
  "leaderboard",
  "podium",
  "ended",
] as const;
export type LivePhase = (typeof LIVE_PHASES)[number];

/** Session modes that run on the live engine (projector + phones). */
export const GAME_MODES = ["live", "battle_buzzer", "battle_royale"] as const;
export type GameMode = (typeof GAME_MODES)[number];

export type Winner = { id: string; nickname: string };

export type Standing = {
  id: string;
  nickname: string;
  score: number;
  /** Points won in the last round. */
  delta: number;
  rank: number;
  /** Rank before the last round, for the leaderboard animation. */
  prevRank: number;
  /** Rebutan: questions won. */
  wins?: number;
};

/** live_state() as the database returns it (supabase/migrations/…_live.sql). */
export type RawLiveState = {
  sessionId: string;
  mode: GameMode;
  versionId: string;
  seed: number | null;
  policy: unknown;
  code: string | null;
  version: number;
  phase: LivePhase;
  round: number | null;
  roundId: string | null;
  questionCount: number;
  questionId: string | null;
  phaseOpenedAt: string | null;
  phaseClosesAt: string | null;
  roundOpenedAt: string | null;
  roundClosesAt: string | null;
  timeLimitMs: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  lobbyLocked: boolean;
  autoAdvance: boolean;
  players: number;
  answered: number;
  /** Rebutan: who won the current round. */
  winner: Winner | null;
  top: Standing[];
  you?: {
    id: string;
    nickname: string;
    score: number;
    streak: number;
    kicked: boolean;
    spectator: boolean;
    rank: number;
    answer: {
      answer: unknown;
      correct: number | null;
      total: number | null;
      points: number;
      timeMs: number | null;
    } | null;
  } | null;
};

/** The correct answer and how the room answered — only once the round is locked. */
export type LiveReveal = {
  config: unknown;
  explanation: string;
  /**
   * How often each choice was picked, by option id (true/false: "true" / "false").
   * Choice types only, host only.
   */
  counts?: Record<string, number>;
  /** Answers with full credit / with less (host only). */
  correct?: number;
  wrong?: number;
};

/** What every screen shows: the projector and the phones. */
export type LiveView = {
  sessionId: string;
  mode: GameMode;
  title: string;
  version: number;
  phase: LivePhase;
  /** 0-based round (= question) index. */
  round: number | null;
  questionCount: number;
  phaseClosesAt: string | null;
  timeLimitMs: number | null;
  paused: boolean;
  pausedRemainingMs: number | null;
  players: number;
  answered: number;
  /** From the countdown to the reveal. */
  question: PlayQuestion | null;
  /** Reveal phase only. */
  reveal: LiveReveal | null;
  /** Rebutan: who won the current round (known from the lock on). */
  winner: Winner | null;
  /** Leaderboard, podium and end. */
  top: Standing[];
  /** The server's clock when this was built (clock skew correction). */
  serverNow: string;
};

export type YouView = {
  id: string;
  nickname: string;
  score: number;
  /** Null while hidden (after answering, until the reveal). */
  rank: number | null;
  streak: number | null;
  kicked: boolean;
  spectator: boolean;
  /** Whether they answered the current round, and what (their own answer only). */
  answered: boolean;
  answer: unknown;
  /** How it went — only from the reveal on (points null until the server sent them). */
  result: { ratio: number; points: number | null } | null;
};

export type PlayerView = LiveView & {
  you: YouView;
  /** Built from a signed broadcast: the personal numbers may still be the old ones. */
  partial?: boolean;
};

export type RosterEntry = { id: string; nickname: string };

export type HostView = LiveView & {
  code: string | null;
  lobbyLocked: boolean;
  autoAdvance: boolean;
  /** Joined participants, in the lobby only. */
  roster: RosterEntry[];
};

export type HostAction = "next" | "auto" | "pause" | "resume" | "end";

/** Rebutan: what a phone learns right after answering (it's one chance, so at once). */
export type BattleOutcome = {
  won: boolean;
  correct: boolean;
  /** Points won, or the penalty (negative). */
  points: number;
};

/** The phone's view of the outside world: Server Actions, or the local engine. */
export type LivePlayerAdapter = {
  join: (nickname: string) => Promise<Result<{ token: string; nickname: string }>>;
  state: (token: string) => Promise<Result<{ view: PlayerView }>>;
  answer: (
    token: string,
    questionId: string,
    answer: unknown,
  ) => Promise<Result<{ outcome?: BattleOutcome }>>;
};

/** The projector's controls. */
export type LiveHostAdapter = {
  state: () => Promise<Result<{ view: HostView }>>;
  advance: (version: number, action: HostAction) => Promise<Result<{ view: HostView }>>;
  settings: (patch: {
    lobbyLocked?: boolean;
    autoAdvance?: boolean;
  }) => Promise<Result<{ view: HostView }>>;
  kick: (participantId: string) => Promise<Result<{ view: HostView }>>;
};
