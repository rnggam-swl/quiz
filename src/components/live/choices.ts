import type { AnswerSlot } from "@/components/player/AnswerShape";
import type { PlayQuestion } from "@/engine/practice/types";
import type { Item } from "@/questions/shared";

/**
 * Choice questions on the projector and in controller mode: one coloured shape per
 * choice, in the order the (session-seeded) public data gives — the same on every screen.
 */
export type Choice = { key: string; item: Item; slot: AnswerSlot };

const slotOf = (index: number) => ((index % 5) + 1) as AnswerSlot;

export function choicesOf(q: PlayQuestion): Choice[] | null {
  const data = q.data as { options?: Item[]; items?: Item[] };
  if (q.type === "multiple_choice" && data.options) {
    return data.options.map((item, i) => ({ key: item.id, item, slot: slotOf(i) }));
  }
  if (q.type === "odd_one_out" && data.items) {
    return data.items.map((item, i) => ({ key: item.id, item, slot: slotOf(i) }));
  }
  if (q.type === "true_false") {
    // Same colours as the true/false player.
    return [
      { key: "true", item: { id: "true", text: "Benar" }, slot: 2 },
      { key: "false", item: { id: "false", text: "Salah" }, slot: 1 },
    ];
  }
  return null;
}

export function isMultiSelect(q: PlayQuestion): boolean {
  return q.type === "multiple_choice" && (q.data as { multiple?: boolean }).multiple === true;
}

/** The answer payload for the picked choices. */
export function answerFor(q: PlayQuestion, keys: string[]): unknown {
  if (q.type === "multiple_choice") return { selectedIds: keys };
  if (q.type === "odd_one_out") return { selectedId: keys[0] };
  return { value: keys[0] === "true" };
}

/** The choices an answer picked (to show a participant their own pick). */
export function keysOf(q: PlayQuestion, answer: unknown): string[] {
  const a = (answer ?? {}) as { selectedIds?: unknown; selectedId?: unknown; value?: unknown };
  if (q.type === "multiple_choice" && Array.isArray(a.selectedIds))
    return a.selectedIds.map(String);
  if (q.type === "odd_one_out" && typeof a.selectedId === "string") return [a.selectedId];
  if (q.type === "true_false" && typeof a.value === "boolean") return [String(a.value)];
  return [];
}

/** Whether a choice is right, from the revealed config. */
export function isCorrectChoice(q: PlayQuestion, config: unknown, key: string): boolean {
  const c = (config ?? {}) as { correctIds?: string[]; oddId?: string; correct?: boolean };
  if (q.type === "multiple_choice") return c.correctIds?.includes(key) ?? false;
  if (q.type === "odd_one_out") return c.oddId === key;
  if (q.type === "true_false") return String(c.correct) === key;
  return false;
}
