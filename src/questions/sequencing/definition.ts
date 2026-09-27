import { z } from "zod";

import { createId } from "@/lib/id";
import { shuffleAvoidingIdentity } from "@/lib/seed-random";

import {
  idListSchema,
  itemHasContent,
  itemLabel,
  itemSchema,
  MAX_ITEMS,
  scoreResult,
  type Item,
} from "../shared";
import type { Issue, QuestionDefinition } from "../types";

export const SEQUENCING_SCORING = ["adjacent", "position"] as const;

const configSchema = z.object({
  /** Authored order = the correct order. */
  items: z.array(itemSchema).max(MAX_ITEMS),
  /**
   * `adjacent`: correct neighbour pairs (A→B, B→C…) / (n − 1), so one item out of
   * place costs little. `position`: items in exactly the right slot / n.
   */
  scoring: z.enum(SEQUENCING_SCORING),
});
export type SequencingConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ orderedIds: idListSchema });
export type SequencingAnswer = z.infer<typeof answerSchema>;

export type SequencingPublic = { items: Item[] };

/** Known ids in first-seen order: a crafted answer can't count an item twice. */
function cleanOrder(config: SequencingConfig, orderedIds: string[]): string[] {
  const known = new Set(config.items.map((i) => i.id));
  const seen = new Set<string>();
  return orderedIds.filter((id) => known.has(id) && !seen.has(id) && !!seen.add(id));
}

export const sequencing: QuestionDefinition<SequencingConfig, SequencingAnswer, SequencingPublic> =
  {
    type: "sequencing",
    label: "Urutkan",
    description: "Susun item ke urutan yang benar.",
    configSchema,
    answerSchema,
    capabilities: {
      modes: { practice: "ok", exam: "ok", live: "ok", battle_royale: "ok" },
      notes: { battle_buzzer: "Menyusun urutan butuh waktu, tidak cocok untuk rebutan." },
      avgSeconds: 30,
      partialCredit: true,
    },

    defaults() {
      return {
        items: [1, 2, 3, 4].map(() => ({ id: createId(), text: "" })),
        scoring: "adjacent",
      };
    },

    validate(config) {
      const issues: Issue[] = [];
      if (config.items.length < 3) issues.push({ path: "items", message: "Minimal butuh 3 item." });
      config.items.forEach((item, i) => {
        if (!itemHasContent(item)) {
          issues.push({ path: `items.${i}.text`, message: `Item ${i + 1} masih kosong.` });
        }
      });
      const seen = new Map<string, number>();
      config.items.forEach((item, i) => {
        const key = item.text.trim().toLowerCase();
        if (!key) return;
        const first = seen.get(key);
        if (first !== undefined) {
          issues.push({
            path: `items.${i}.text`,
            message: `${itemLabel(item, i, "Item")} sama dengan item ${first + 1}; urutannya jadi ambigu.`,
          });
        } else seen.set(key, i);
      });
      return issues;
    },

    score(config, answer) {
      const order = cleanOrder(config, answer.orderedIds);
      const key = config.items.map((i) => i.id);
      if (config.scoring === "position") {
        return scoreResult(order.filter((id, i) => key[i] === id).length, key.length);
      }
      const next = new Map(key.slice(0, -1).map((id, i) => [id, key[i + 1]]));
      let hits = 0;
      for (let i = 0; i < order.length - 1; i++) if (next.get(order[i]!) === order[i + 1]) hits++;
      return scoreResult(hits, Math.max(0, key.length - 1));
    },

    stripAnswers(config, { seed }) {
      // Always shuffled (never the authored order), even when shuffling is off: that order is the key.
      return { items: shuffleAvoidingIdentity(config.items, seed) };
    },

    isAnswered(answer) {
      return (answer?.orderedIds.length ?? 0) > 0;
    },
  };
