import { z } from "zod";

import { createId } from "@/lib/id";
import { shuffle } from "@/lib/seed-random";

import { itemHasContent, itemLabel, itemSchema, scoreResult, type Item } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

/** One answer colour + shape per item in the player, like Pilihan Ganda. */
export const MAX_ODD_ITEMS = 5;

const configSchema = z.object({
  items: z.array(itemSchema).max(MAX_ODD_ITEMS),
  /** The item that doesn't belong; empty until the author picks one. */
  oddId: z.string().max(40),
  /** Why it's the odd one — shown when the answer is revealed. */
  reason: z.string().max(500).optional(),
});
export type OddOneOutConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ selectedId: z.string().min(1).max(40) });
export type OddOneOutAnswer = z.infer<typeof answerSchema>;

export type OddOneOutPublic = { items: Item[] };

export const oddOneOut: QuestionDefinition<OddOneOutConfig, OddOneOutAnswer, OddOneOutPublic> = {
  type: "odd_one_out",
  label: "Odd One Out",
  description: "Temukan satu item yang tidak cocok dengan yang lain.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_buzzer: "ok", battle_royale: "ok" },
    avgSeconds: 15,
    partialCredit: false,
  },

  defaults() {
    return { items: [1, 2, 3, 4].map(() => ({ id: createId(), text: "" })), oddId: "" };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (config.items.length < 3) issues.push({ path: "items", message: "Minimal butuh 3 item." });
    config.items.forEach((item, i) => {
      if (!itemHasContent(item)) {
        issues.push({ path: `items.${i}.text`, message: `Item ${i + 1} masih kosong.` });
      }
    });
    if (!config.items.some((item) => item.id === config.oddId)) {
      issues.push({ path: "oddId", message: "Tandai item yang tidak cocok." });
    }
    const seen = new Map<string, number>();
    config.items.forEach((item, i) => {
      const key = item.text.trim().toLowerCase();
      if (!key) return;
      const first = seen.get(key);
      if (first !== undefined) {
        issues.push({
          path: `items.${i}.text`,
          message: `${itemLabel(item, i, "Item")} sama dengan item ${first + 1}.`,
        });
      } else seen.set(key, i);
    });
    return issues;
  },

  score(config, answer) {
    return scoreResult(config.oddId !== "" && answer.selectedId === config.oddId ? 1 : 0, 1);
  },

  stripAnswers(config, { seed, shuffle: doShuffle }) {
    return { items: doShuffle ? shuffle(config.items, seed) : config.items };
  },

  isAnswered(answer) {
    return !!answer?.selectedId;
  },
};
