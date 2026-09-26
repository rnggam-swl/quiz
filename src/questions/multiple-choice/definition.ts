import { z } from "zod";

import { createId } from "@/lib/id";
import { shuffle } from "@/lib/seed-random";

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

const configSchema = z.object({
  options: z.array(itemSchema).max(MAX_ITEMS),
  correctIds: z.array(z.string()).max(MAX_ITEMS),
  /** true = "pilih semua yang benar" (checkboxes), false = exactly one answer. */
  multiple: z.boolean(),
});
export type MultipleChoiceConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({ selectedIds: idListSchema });
export type MultipleChoiceAnswer = z.infer<typeof answerSchema>;

export type MultipleChoicePublic = { options: Item[]; multiple: boolean };

/** One option per answer colour + shape in the player (docs/05-design-system.md). */
export const MAX_OPTIONS = 5;

export const multipleChoice: QuestionDefinition<
  MultipleChoiceConfig,
  MultipleChoiceAnswer,
  MultipleChoicePublic
> = {
  type: "multiple_choice",
  label: "Pilihan Ganda",
  description: "Pilih satu jawaban benar, atau beberapa sekaligus.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_buzzer: "ok", battle_royale: "ok" },
    avgSeconds: 15,
    partialCredit: true,
  },

  defaults() {
    return {
      options: [1, 2, 3, 4].map(() => ({ id: createId(), text: "" })),
      correctIds: [],
      multiple: false,
    };
  },

  validate(config) {
    const issues: Issue[] = [];
    const filled = config.options.filter(itemHasContent);
    if (filled.length < 2) issues.push({ path: "options", message: "Minimal butuh 2 opsi." });
    if (config.options.length > MAX_OPTIONS) {
      issues.push({ path: "options", message: `Maksimal ${MAX_OPTIONS} opsi.` });
    }
    config.options.forEach((option, i) => {
      if (!itemHasContent(option)) {
        issues.push({ path: `options.${i}.text`, message: `Opsi ${i + 1} masih kosong.` });
      }
    });

    const optionIds = new Set(config.options.map((o) => o.id));
    const correct = config.correctIds.filter((id) => optionIds.has(id));
    if (correct.length === 0) {
      issues.push({ path: "correctIds", message: "Tandai minimal satu jawaban benar." });
    } else if (!config.multiple && correct.length > 1) {
      issues.push({
        path: "correctIds",
        message: "Mode satu jawaban hanya boleh punya satu jawaban benar.",
      });
    }

    const seen = new Map<string, number>();
    config.options.forEach((option, i) => {
      const key = option.text.trim().toLowerCase();
      if (!key) return;
      const first = seen.get(key);
      if (first !== undefined) {
        issues.push({
          path: `options.${i}.text`,
          message: `${itemLabel(option, i)} sama dengan opsi ${first + 1}.`,
        });
      } else seen.set(key, i);
    });
    return issues;
  },

  score(config, answer) {
    const correct = new Set(config.correctIds);
    const selected = new Set(answer.selectedIds);
    if (!config.multiple) {
      const [only] = selected;
      return scoreResult(selected.size === 1 && only !== undefined && correct.has(only) ? 1 : 0, 1);
    }
    // Multi-select: wrong picks cancel right ones, so ticking everything never pays off.
    let hits = 0;
    let misses = 0;
    for (const id of selected) {
      if (correct.has(id)) hits++;
      else misses++;
    }
    return scoreResult(Math.max(0, hits - misses), correct.size);
  },

  stripAnswers(config, { seed, shuffle: doShuffle }) {
    return {
      options: doShuffle ? shuffle(config.options, seed) : config.options,
      multiple: config.multiple,
    };
  },

  isAnswered(answer) {
    return (answer?.selectedIds.length ?? 0) > 0;
  },
};
