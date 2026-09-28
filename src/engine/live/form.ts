import { z } from "zod";

import { DEFAULT_POLICIES, policySchema, type Policy } from "@/engine/policy";
import type { Snapshot } from "@/engine/practice/snapshot";
import { shuffle } from "@/lib/seed-random";
import { getDefinition } from "@/questions/registry";

/** The "Mulai live" options (P5-09) and the session they become. */
export const liveFormSchema = z.object({
  /** Seconds per question when the question has no own limit. */
  perQuestionS: z.number().int().min(5).max(600),
  shuffleQuestions: z.boolean(),
  shuffleOptions: z.boolean(),
  autoAdvance: z.boolean(),
  lateJoin: z.enum(["allow", "spectator", "deny"]),
});
export type LiveForm = z.infer<typeof liveFormSchema>;

export const DEFAULT_LIVE_FORM: LiveForm = {
  perQuestionS: DEFAULT_POLICIES.live.timer.perQuestionS ?? 20,
  shuffleQuestions: false,
  shuffleOptions: false,
  autoAdvance: false,
  lateJoin: "allow",
};

export function livePolicyFrom(form: LiveForm): Policy {
  return policySchema.parse({
    ...DEFAULT_POLICIES.live,
    timer: { perQuestionS: form.perQuestionS },
    shuffleQuestions: form.shuffleQuestions,
    shuffleOptions: form.shuffleOptions,
    autoAdvance: form.autoAdvance,
    lateJoin: form.lateJoin,
  });
}

/** Questions a live session can play (docs/04 · capability matrix): the rest are skipped. */
export function liveQuestions(snapshot: Snapshot) {
  const playable = snapshot.questions.filter(
    (q) => getDefinition(q.type).capabilities.modes.live !== undefined,
  );
  const skipped = snapshot.questions
    .map((q, i) => ({ q, number: i + 1 }))
    .filter(({ q }) => getDefinition(q.type).capabilities.modes.live === undefined)
    .map(({ q, number }) => ({ number, typeLabel: getDefinition(q.type).label }));
  return { playable, skipped };
}

/** The one question order everybody plays (the projector shows it too). */
export function liveQuestionOrder(snapshot: Snapshot, policy: Policy, seed: number): string[] {
  const ids = liveQuestions(snapshot).playable.map((q) => q.id);
  return policy.shuffleQuestions ? shuffle(ids, seed) : ids;
}
