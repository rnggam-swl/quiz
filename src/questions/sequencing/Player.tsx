"use client";

import { Check, ChevronDown, ChevronUp, GripVertical } from "lucide-react";

import { ItemContent } from "@/components/player/ItemContent";
import { moveBy, SortableList } from "@/components/ui/SortableList";
import { cn } from "@/lib/cn";

import type { Item } from "../shared";
import type { PlayerProps } from "../ui-types";
import type { SequencingAnswer, SequencingConfig, SequencingPublic } from "./definition";

/** The items in the participant's current order (their answer, else the shuffled order sent). */
function currentOrder(items: Item[], answer: SequencingAnswer | null): Item[] {
  if (!answer) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const ordered = answer.orderedIds.map((id) => byId.get(id)).filter((i): i is Item => !!i);
  return [...ordered, ...items.filter((i) => !answer.orderedIds.includes(i.id))];
}

export function SequencingPlayer({
  data,
  answer,
  onAnswer,
  disabled,
  reveal,
}: PlayerProps<SequencingPublic, SequencingAnswer, SequencingConfig>) {
  const locked = disabled || !!reveal;
  const items = currentOrder(data.items, answer);
  const correctIndex = reveal ? new Map(reveal.items.map((item, i) => [item.id, i])) : null;
  const reorder = (next: Item[]) => onAnswer({ orderedIds: next.map((i) => i.id) });

  return (
    <div className="flex flex-col gap-3">
      {!reveal && (
        <p className="text-sm font-medium text-fg-muted">
          {answer
            ? "Urutan kamu:"
            : "Seret atau pakai tombol panah untuk menyusun urutan yang benar."}
        </p>
      )}
      <SortableList
        items={items}
        onReorder={reorder}
        disabled={locked}
        itemName={(item, i) => item.text.trim() || `Item ${i + 1}`}
      >
        {(item, index, { handle, isDragging }) => {
          const target = correctIndex?.get(item.id);
          const right = target === index;
          return (
            <div
              className={cn(
                "flex min-h-16 items-center gap-2 rounded-2xl border-2 bg-surface p-2 pr-3 shadow-card transition-colors",
                isDragging ? "border-theme shadow-pop" : "border-line",
                reveal &&
                  (right ? "border-success bg-success-soft" : "border-danger bg-danger-soft"),
              )}
            >
              {!locked && (
                <button
                  type="button"
                  className="flex h-12 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg text-fg-subtle hover:bg-surface-muted active:cursor-grabbing"
                  aria-label={`Seret ${item.text.trim() || `item ${index + 1}`}`}
                  {...handle}
                >
                  <GripVertical className="size-5" />
                </button>
              )}
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-theme text-sm font-semibold text-on-theme">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 font-medium">
                <ItemContent
                  item={item}
                  fallback={`Item ${index + 1}`}
                  imageClassName="sm:size-14"
                />
              </span>
              {reveal && target !== undefined && (
                <span
                  className={cn(
                    "flex shrink-0 items-center gap-1 text-sm font-semibold",
                    right ? "text-success" : "text-danger",
                  )}
                >
                  {right ? (
                    <Check aria-label="posisi benar" className="size-5" strokeWidth={3} />
                  ) : (
                    <>seharusnya #{target + 1}</>
                  )}
                </span>
              )}
              {!locked && (
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => reorder(moveBy(items, index, -1))}
                    aria-label={`Naikkan ${item.text.trim() || `item ${index + 1}`}`}
                    className="inline-flex size-10 items-center justify-center rounded-full border-2 border-line text-fg hover:border-fg disabled:opacity-30"
                  >
                    <ChevronUp className="size-5" />
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => reorder(moveBy(items, index, 1))}
                    aria-label={`Turunkan ${item.text.trim() || `item ${index + 1}`}`}
                    className="inline-flex size-10 items-center justify-center rounded-full border-2 border-line text-fg hover:border-fg disabled:opacity-30"
                  >
                    <ChevronDown className="size-5" />
                  </button>
                </div>
              )}
            </div>
          );
        }}
      </SortableList>
    </div>
  );
}
