import { z } from "zod";

import { createId } from "@/lib/id";
import { shuffle, shuffleAvoidingIdentity } from "@/lib/seed-random";

import {
  itemHasContent,
  itemLabel,
  itemSchema,
  MAX_ITEMS,
  scoreResult,
  type Item,
} from "../shared";
import type { Issue, QuestionDefinition } from "../types";

const pairSchema = z.object({
  leftId: z.string().min(1).max(40),
  rightId: z.string().min(1).max(40),
});
export type MatchPair = z.infer<typeof pairSchema>;

const configSchema = z.object({
  left: z.array(itemSchema).max(MAX_ITEMS),
  /** Right items; one without a pair acts as a distractor. */
  right: z.array(itemSchema).max(MAX_ITEMS * 2),
  /** One left may have several rights; each right belongs to at most one left. */
  pairs: z.array(pairSchema).max(MAX_ITEMS * 2),
});
export type MatchingConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ pairs: z.array(pairSchema).max(50) });
export type MatchingAnswer = z.infer<typeof answerSchema>;

export type MatchingPublic = { left: Item[]; right: Item[] };

const pairKey = (p: MatchPair) => `${p.leftId}\u0000${p.rightId}`;

/** Pairs whose ids still exist — drafts can hold pairs pointing at deleted items. */
function livePairs(config: MatchingConfig): MatchPair[] {
  const left = new Set(config.left.map((i) => i.id));
  const right = new Set(config.right.map((i) => i.id));
  return config.pairs.filter((p) => left.has(p.leftId) && right.has(p.rightId));
}

export const matching: QuestionDefinition<MatchingConfig, MatchingAnswer, MatchingPublic> = {
  type: "matching",
  label: "Matching",
  description: "Pasangkan item di kiri dengan pasangannya di kanan.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok" },
    notes: {
      battle_buzzer: "Memasangkan banyak item terlalu lama untuk rebutan.",
      battle_royale: "Memasangkan banyak item terlalu lama untuk royale.",
    },
    avgSeconds: 45,
    partialCredit: true,
  },

  defaults() {
    const left = [1, 2, 3].map(() => ({ id: createId(), text: "" }));
    const right = left.map(() => ({ id: createId(), text: "" }));
    return {
      left,
      right,
      pairs: left.map((l, i) => ({ leftId: l.id, rightId: right[i]!.id })),
    };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (config.left.length < 2) issues.push({ path: "left", message: "Minimal butuh 2 item." });

    config.left.forEach((item, i) => {
      if (!itemHasContent(item)) {
        issues.push({ path: `left.${i}.text`, message: `Item ${i + 1} masih kosong.` });
      }
    });
    config.right.forEach((item, i) => {
      if (!itemHasContent(item)) {
        issues.push({ path: `right.${i}.text`, message: `Pasangan ${i + 1} masih kosong.` });
      }
    });

    const pairs = livePairs(config);
    config.left.forEach((item, i) => {
      if (!pairs.some((p) => p.leftId === item.id)) {
        issues.push({
          path: `left.${i}`,
          message: `${itemLabel(item, i, "Item")} belum punya pasangan.`,
        });
      }
    });

    const owners = new Map<string, number>();
    for (const p of pairs) owners.set(p.rightId, (owners.get(p.rightId) ?? 0) + 1);
    config.right.forEach((item, i) => {
      if ((owners.get(item.id) ?? 0) > 1) {
        issues.push({
          path: `right.${i}`,
          message: `${itemLabel(item, i, "Pasangan")} dipasangkan ke lebih dari satu item.`,
        });
      }
    });
    return issues;
  },

  score(config, answer) {
    const key = new Set(livePairs(config).map(pairKey));
    const given = new Set(answer.pairs.map(pairKey));
    let hits = 0;
    let misses = 0;
    for (const k of given) {
      if (key.has(k)) hits++;
      else misses++;
    }
    return scoreResult(Math.max(0, hits - misses), key.size);
  },

  stripAnswers(config, { seed, shuffle: doShuffle }) {
    return {
      left: doShuffle ? shuffle(config.left, seed) : config.left,
      // The right column is always shuffled — in authored order it would give the pairs away.
      right: shuffleAvoidingIdentity(config.right, seed),
    };
  },

  isAnswered(answer) {
    return (answer?.pairs.length ?? 0) > 0;
  },
};
