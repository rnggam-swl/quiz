import { cn } from "@/lib/cn";

/** Answer slots 1–5: each has a colour AND a shape, so colour is never the only cue. */
export const ANSWER_SLOTS = [1, 2, 3, 4, 5] as const;
export type AnswerSlot = (typeof ANSWER_SLOTS)[number];

export const ANSWER_SHAPE_NAMES: Record<AnswerSlot, string> = {
  1: "segitiga",
  2: "belah ketupat",
  3: "lingkaran",
  4: "kotak",
  5: "bintang",
};

// Literal class names so Tailwind can see them.
const slotClasses: Record<AnswerSlot, string> = {
  1: "bg-answer-1 text-on-answer-1",
  2: "bg-answer-2 text-on-answer-2",
  3: "bg-answer-3 text-on-answer-3",
  4: "bg-answer-4 text-on-answer-4",
  5: "bg-answer-5 text-on-answer-5",
};

const paths: Record<AnswerSlot, string> = {
  1: "M12 3 22 20H2Z",
  2: "M12 2 22 12 12 22 2 12Z",
  3: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z",
  4: "M4 4h16v16H4Z",
  5: "m12 2 2.9 6.26 6.86.8-5.08 4.68 1.36 6.77L12 17.1l-6.04 3.41 1.36-6.77L2.24 9.06l6.86-.8Z",
};

export function answerSlotClasses(slot: AnswerSlot): string {
  return slotClasses[slot];
}

/** Coloured tile with the slot's shape, e.g. next to an option or on the projector legend. */
export function AnswerShape({ slot, className }: { slot: AnswerSlot; className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center", slotClasses[slot], className)}>
      <svg viewBox="0 0 24 24" className="size-full" fill="currentColor" aria-hidden>
        <path d={paths[slot]} />
      </svg>
    </span>
  );
}
