import type { AnswerSlot } from "@/components/player/AnswerShape";

const ANIMALS = [
  "🐯",
  "🦊",
  "🐼",
  "🐨",
  "🐸",
  "🐵",
  "🦁",
  "🐰",
  "🐻",
  "🐧",
  "🦉",
  "🐙",
  "🦄",
  "🐢",
  "🐳",
  "🦋",
  "🐝",
  "🐬",
  "🦒",
  "🐹",
];

/** FNV-1a: small, stable, good enough to spread ids over a few buckets. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A participant's avatar: the same animal and colour on every screen, from their id. */
export function avatarFor(id: string): { emoji: string; slot: AnswerSlot } {
  const h = hash(id);
  return {
    emoji: ANIMALS[h % ANIMALS.length]!,
    slot: ((Math.floor(h / 97) % 5) + 1) as AnswerSlot,
  };
}
