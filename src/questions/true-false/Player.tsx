"use client";

import { AnswerTile, type AnswerTileState } from "@/components/player/AnswerTile";

import type { PlayerProps } from "../ui-types";
import type { TrueFalseAnswer, TrueFalseConfig, TrueFalsePublic } from "./definition";

const CHOICES = [
  { value: true, label: "Benar", slot: 2 },
  { value: false, label: "Salah", slot: 1 },
] as const;

export function TrueFalsePlayer({
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<TrueFalsePublic, TrueFalseAnswer, TrueFalseConfig>) {
  function stateOf(value: boolean): AnswerTileState {
    const isSelected = answer?.value === value;
    if (reveal) {
      if (reveal.correct === value) return isSelected ? "correct" : "missed";
      return isSelected ? "wrong" : "dimmed";
    }
    return isSelected ? "selected" : "idle";
  }

  return (
    <div className="grid grid-cols-2 gap-3" role="group" aria-label="Benar atau salah">
      {CHOICES.map(({ value, label, slot }) => (
        <AnswerTile
          key={label}
          slot={slot}
          state={stateOf(value)}
          disabled={disabled || !!reveal}
          onClick={() => {
            onAnswer({ value });
            onCommit?.({ value });
          }}
        >
          {label}
        </AnswerTile>
      ))}
    </div>
  );
}
