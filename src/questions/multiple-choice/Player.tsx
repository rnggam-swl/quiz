"use client";

import type { AnswerSlot } from "@/components/player/AnswerShape";
import { AnswerTile, type AnswerTileState } from "@/components/player/AnswerTile";

import type { PlayerProps } from "../ui-types";
import type {
  MultipleChoiceAnswer,
  MultipleChoiceConfig,
  MultipleChoicePublic,
} from "./definition";

export function MultipleChoicePlayer({
  data,
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<MultipleChoicePublic, MultipleChoiceAnswer, MultipleChoiceConfig>) {
  const selected = new Set(answer?.selectedIds ?? []);
  const correct = reveal ? new Set(reveal.correctIds) : null;

  function choose(id: string) {
    if (data.multiple) {
      const next = selected.has(id) ? [...selected].filter((s) => s !== id) : [...selected, id];
      onAnswer({ selectedIds: next });
    } else {
      const next = { selectedIds: [id] };
      onAnswer(next);
      onCommit?.(next);
    }
  }

  function stateOf(id: string): AnswerTileState {
    const isSelected = selected.has(id);
    if (correct) {
      if (correct.has(id)) return isSelected ? "correct" : "missed";
      return isSelected ? "wrong" : "dimmed";
    }
    return isSelected ? "selected" : "idle";
  }

  return (
    <div className="flex flex-col gap-3">
      {data.multiple && !reveal && (
        <p className="text-sm font-medium text-fg-muted">Pilih semua jawaban yang benar.</p>
      )}
      <div
        className="grid gap-3 sm:grid-cols-2"
        role="group"
        aria-label={data.multiple ? "Pilih semua yang benar" : "Pilih satu jawaban"}
      >
        {data.options.map((option, index) => (
          <AnswerTile
            key={option.id}
            slot={((index % 5) + 1) as AnswerSlot}
            state={stateOf(option.id)}
            checkbox={data.multiple}
            disabled={disabled || !!reveal}
            onClick={() => choose(option.id)}
          >
            {option.text || `Opsi ${index + 1}`}
          </AnswerTile>
        ))}
      </div>
    </div>
  );
}
