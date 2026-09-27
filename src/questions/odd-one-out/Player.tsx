"use client";

import { Lightbulb } from "lucide-react";

import type { AnswerSlot } from "@/components/player/AnswerShape";
import { AnswerTile, type AnswerTileState } from "@/components/player/AnswerTile";
import { ItemContent } from "@/components/player/ItemContent";

import type { PlayerProps } from "../ui-types";
import type { OddOneOutAnswer, OddOneOutConfig, OddOneOutPublic } from "./definition";

export function OddOneOutPlayer({
  data,
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<OddOneOutPublic, OddOneOutAnswer, OddOneOutConfig>) {
  function stateOf(id: string): AnswerTileState {
    const isSelected = answer?.selectedId === id;
    if (reveal) {
      if (reveal.oddId === id) return isSelected ? "correct" : "missed";
      return isSelected ? "wrong" : "dimmed";
    }
    return isSelected ? "selected" : "idle";
  }

  return (
    <div className="flex flex-col gap-3">
      {!reveal && (
        <p className="text-sm font-medium text-fg-muted">Mana yang tidak cocok dengan yang lain?</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Pilih yang tidak cocok">
        {data.items.map((item, index) => (
          <AnswerTile
            key={item.id}
            slot={((index % 5) + 1) as AnswerSlot}
            state={stateOf(item.id)}
            disabled={disabled || !!reveal}
            onClick={() => {
              const next = { selectedId: item.id };
              onAnswer(next);
              onCommit?.(next);
            }}
          >
            <ItemContent item={item} fallback={`Item ${index + 1}`} />
          </AnswerTile>
        ))}
      </div>
      {reveal?.reason && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-fg">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{reveal.reason}</span>
        </p>
      )}
    </div>
  );
}
