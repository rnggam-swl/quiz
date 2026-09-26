import { Check, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

import { ANSWER_SHAPE_NAMES, AnswerShape, type AnswerSlot } from "./AnswerShape";
import { Button3D } from "./Button3D";

export type AnswerTileState = "idle" | "selected" | "correct" | "wrong" | "missed" | "dimmed";

type AnswerTileProps = {
  slot: AnswerSlot;
  children: ReactNode;
  state?: AnswerTileState;
  /** Checkbox look (multi-select) instead of a single-choice tile. */
  checkbox?: boolean;
  disabled?: boolean;
  onClick?: () => void;
};

/**
 * Big coloured answer button for the player: colour + shape per slot, and
 * reveal states. Colour is never the only cue — shape and ✓/✗ icons carry it too.
 */
export function AnswerTile({
  slot,
  children,
  state = "idle",
  checkbox,
  disabled,
  onClick,
}: AnswerTileProps) {
  const selected = state === "selected" || state === "correct" || state === "wrong";
  return (
    <Button3D
      block
      size="xl"
      color={`var(--answer-${slot})`}
      textColor={`var(--on-answer-${slot})`}
      pressed={checkbox ? selected : undefined}
      data-pressed={selected || undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "min-h-20 justify-start rounded-2xl px-4 py-3 text-left text-base leading-snug sm:text-lg",
        state === "dimmed" && "opacity-40",
        state === "missed" && "ring-4 ring-success ring-offset-2 ring-offset-canvas",
        (state === "selected" || state === "correct") &&
          "ring-4 ring-fg/80 ring-offset-2 ring-offset-canvas",
        // Revealed tiles stay vivid even though they're disabled; dimmed ones fade.
        disabled && state !== "idle" && state !== "dimmed" && "disabled:opacity-100",
      )}
    >
      <AnswerShape slot={slot} className="size-7 shrink-0 bg-transparent" />
      <span className="sr-only">{ANSWER_SHAPE_NAMES[slot]}:</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {checkbox && state !== "correct" && state !== "wrong" && (
        <span
          aria-hidden
          className={cn(
            "inline-flex size-7 shrink-0 items-center justify-center rounded-md border-2 border-current",
            selected ? "bg-white/90 text-fg" : "opacity-70",
          )}
        >
          {selected && <Check className="size-4" strokeWidth={3} />}
        </span>
      )}
      {(state === "correct" || state === "missed") && (
        <Check aria-label="benar" className="size-7 shrink-0" strokeWidth={3} />
      )}
      {state === "wrong" && <X aria-label="salah" className="size-7 shrink-0" strokeWidth={3} />}
    </Button3D>
  );
}
