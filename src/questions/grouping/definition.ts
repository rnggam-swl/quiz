import { z } from "zod";

import { createId } from "@/lib/id";
import { shuffleAvoidingIdentity } from "@/lib/seed-random";

import { itemHasContent, itemSchema, MAX_ITEMS, scoreResult, type Item } from "../shared";
import type { Issue, QuestionDefinition } from "../types";

/** One answer colour + shape per group in the player. */
export const MAX_GROUPS = 5;

const groupSchema = z.object({
  id: z.string().min(1).max(40),
  name: z.string().max(100),
});
export type Group = z.infer<typeof groupSchema>;

const configSchema = z.object({
  groups: z.array(groupSchema).max(MAX_GROUPS),
  items: z.array(itemSchema.extend({ groupId: z.string().max(40) })).max(MAX_ITEMS),
});
export type GroupingConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({
  /** itemId → groupId. Items left out are unplaced. */
  placement: z
    .record(z.string().min(1).max(40), z.string().min(1).max(40))
    .refine((p) => Object.keys(p).length <= 50, "Terlalu banyak item."),
});
export type GroupingAnswer = z.infer<typeof answerSchema>;

export type GroupingPublic = { groups: Group[]; items: Item[] };

export const grouping: QuestionDefinition<GroupingConfig, GroupingAnswer, GroupingPublic> = {
  type: "grouping",
  label: "Kelompokkan",
  description: "Masukkan setiap item ke kelompok yang tepat.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_royale: "ok" },
    notes: { battle_buzzer: "Mengelompokkan banyak item tidak cocok untuk rebutan." },
    avgSeconds: 40,
    partialCredit: true,
  },

  defaults() {
    const groups = [1, 2].map(() => ({ id: createId(), name: "" }));
    return {
      groups,
      items: groups.flatMap((g) => [1, 2].map(() => ({ id: createId(), text: "", groupId: g.id }))),
    };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (config.groups.length < 2) {
      issues.push({ path: "groups", message: "Minimal butuh 2 kelompok." });
    }
    config.groups.forEach((group, i) => {
      if (!group.name.trim()) {
        issues.push({ path: `groups.${i}.name`, message: `Nama kelompok ${i + 1} masih kosong.` });
      }
      if (!config.items.some((item) => item.groupId === group.id)) {
        issues.push({
          path: `groups.${i}`,
          message: `Kelompok ${group.name.trim() ? `"${group.name.trim()}"` : i + 1} belum punya item.`,
        });
      }
    });
    const groupIds = new Set(config.groups.map((g) => g.id));
    config.items.forEach((item, i) => {
      if (!itemHasContent(item)) {
        issues.push({ path: `items.${i}.text`, message: `Item ${i + 1} masih kosong.` });
      } else if (!groupIds.has(item.groupId)) {
        issues.push({ path: `items.${i}`, message: `Item ${i + 1} belum masuk kelompok.` });
      }
    });
    return issues;
  },

  score(config, answer) {
    const correct = config.items.filter(
      (item) =>
        Object.hasOwn(answer.placement, item.id) && answer.placement[item.id] === item.groupId,
    ).length;
    return scoreResult(correct, config.items.length);
  },

  stripAnswers(config, { seed }) {
    // Items are authored group by group; always shuffle so that order doesn't hint the groups.
    const items = config.items.map((item): Item => ({
      id: item.id,
      text: item.text,
      ...(item.media && { media: item.media }),
    }));
    return { groups: config.groups, items: shuffleAvoidingIdentity(items, seed) };
  },

  isAnswered(answer) {
    return Object.keys(answer?.placement ?? {}).length > 0;
  },
};
