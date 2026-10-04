import { z } from "zod";

import { DEFAULT_POLICIES, policySchema, type Policy } from "@/engine/policy";
import type { Snapshot } from "@/engine/practice/snapshot";
import { shuffle } from "@/lib/seed-random";
import { getDefinition } from "@/questions/registry";

import type { GameMode } from "./types";

/** Modes the "Mulai live" dialog can open. */
export const STARTABLE_MODES = ["live", "battle_buzzer", "battle_royale"] as const;

/** The "Mulai live" options (P5-09, P6-06) and the session they become. */
export const liveFormSchema = z.object({
  mode: z.enum(STARTABLE_MODES),
  /** Seconds per question when the question has no own limit. */
  perQuestionS: z.number().int().min(5).max(600),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  autoAdvance: z.boolean(),
  lateJoin: z.enum(["allow", "spectator", "deny"]),
  /** Rebutan: first right answer wins, or press BUZZ then answer (P8-01). */
  buzzVariant: z.enum(["first_correct", "buzz_then_answer"]),
  /** Rebutan "Pencet lalu Jawab": seconds the buzzer holds the round. */
  holdS: z.number().int().min(1).max(30),
  /** Rebutan: points taken for a wrong answer. */
  wrongPenalty: z.number().int().min(0).max(10_000),
  /** Rebutan: the grace window (P8-04). */
  graceMs: z.number().int().min(0).max(1000),
  /** Battle royale. */
  lives: z.number().int().min(1).max(10),
  shrinkTimerPct: z.number().int().min(0).max(50),
  eliminateSlowest: z.boolean(),
  suddenDeath: z.boolean(),
  /** Mode tim (P8-02). */
  teamsEnabled: z.boolean(),
  teamCount: z.number().int().min(2).max(5),
  teamAssign: z.enum(["auto", "choose"]),
});
export type LiveForm = z.infer<typeof liveFormSchema>;

export const DEFAULT_LIVE_FORM: LiveForm = {
  mode: "live",
  perQuestionS: DEFAULT_POLICIES.live.timer.perQuestionS ?? 20,
  shuffleQuestions: false,
  shuffleOptions: false,
  autoAdvance: false,
  lateJoin: "allow",
  buzzVariant: "first_correct",
  holdS: DEFAULT_POLICIES.battle_buzzer.buzzer.holdS,
  wrongPenalty: 0,
  graceMs: DEFAULT_POLICIES.battle_buzzer.buzzer.graceMs,
  lives: DEFAULT_POLICIES.battle_royale.royale.lives,
  shrinkTimerPct: DEFAULT_POLICIES.battle_royale.royale.shrinkTimerPct,
  eliminateSlowest: DEFAULT_POLICIES.battle_royale.royale.eliminateSlowest,
  suddenDeath: DEFAULT_POLICIES.battle_royale.royale.suddenDeath,
  teamsEnabled: false,
  teamCount: 2,
  teamAssign: "auto",
};

/** The late-join default each mode starts with in the dialog. */
export const DEFAULT_LATE_JOIN: Record<LiveForm["mode"], LiveForm["lateJoin"]> = {
  live: "allow",
  battle_buzzer: "allow",
  battle_royale: "spectator",
};

export function livePolicyFrom(form: LiveForm): Policy {
  const base = DEFAULT_POLICIES[form.mode];
  return policySchema.parse({
    ...base,
    timer: { perQuestionS: form.perQuestionS },
    shuffleQuestions: form.shuffleQuestions,
    shuffleOptions: form.shuffleOptions,
    autoAdvance: form.autoAdvance,
    lateJoin: form.lateJoin,
    buzzer: {
      variant: form.buzzVariant,
      holdS: form.holdS,
      wrongPenalty: form.wrongPenalty,
      graceMs: form.graceMs,
    },
    royale: {
      lives: form.lives,
      shrinkTimerPct: form.shrinkTimerPct,
      eliminateSlowest: form.eliminateSlowest,
      suddenDeath: form.suddenDeath,
    },
    teams: { enabled: form.teamsEnabled, count: form.teamCount, assign: form.teamAssign },
  });
}

type Listed = { number: number; typeLabel: string; note?: string };

/**
 * Questions a session of this mode can play (docs/04 · capability matrix). Types
 * without the mode are skipped; "warn" types are played but listed with the reason.
 */
export function liveQuestions(snapshot: Snapshot, mode: GameMode = "live") {
  const playable = [];
  const skipped: Listed[] = [];
  const warned: Listed[] = [];
  for (const [i, q] of snapshot.questions.entries()) {
    const { label, capabilities } = getDefinition(q.type);
    const level = capabilities.modes[mode];
    if (level === undefined) skipped.push({ number: i + 1, typeLabel: label });
    else {
      playable.push(q);
      if (level === "warn") {
        warned.push({ number: i + 1, typeLabel: label, note: capabilities.notes?.[mode] });
      }
    }
  }
  return { playable, skipped, warned };
}

/** The one question order everybody plays (the projector shows it too). */
export function liveQuestionOrder(
  snapshot: Snapshot,
  policy: Policy,
  seed: number,
  mode: GameMode = "live",
): string[] {
  const ids = liveQuestions(snapshot, mode).playable.map((q) => q.id);
  return policy.shuffleQuestions ? shuffle(ids, seed) : ids;
}
