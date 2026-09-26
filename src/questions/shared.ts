import { z } from "zod";

import type { ScoreResult } from "./types";

export const MAX_ITEM_TEXT = 500;
export const MAX_ITEMS = 20;

export const mediaSchema = z.object({
  kind: z.enum(["image", "audio", "video"]),
  url: z.string().min(1),
  alt: z.string().max(300).optional(),
});
export type MediaRef = z.infer<typeof mediaSchema>;

/** An option/item with a stable id. Text may be empty in drafts; validate() catches that. */
export const itemSchema = z.object({
  id: z.string().min(1).max(40),
  text: z.string().max(MAX_ITEM_TEXT),
  media: mediaSchema.optional(),
});
export type Item = z.infer<typeof itemSchema>;

/** Ids submitted by a participant. Bounded so a malicious payload can't blow up scoring. */
export const idListSchema = z.array(z.string().min(1).max(40)).max(50);

export function scoreResult(correct: number, total: number): ScoreResult {
  const safeCorrect = Math.max(0, Math.min(correct, total));
  return { correct: safeCorrect, total, ratio: total > 0 ? safeCorrect / total : 0 };
}

export function itemHasContent(item: Item): boolean {
  return item.text.trim().length > 0 || item.media !== undefined;
}

/** Plain-text label for an item in messages: its text, or "Opsi 3" when it only has media. */
export function itemLabel(item: Item, index: number, noun = "Opsi"): string {
  const text = item.text.trim();
  return text ? `"${text.length > 40 ? `${text.slice(0, 40)}…` : text}"` : `${noun} ${index + 1}`;
}
