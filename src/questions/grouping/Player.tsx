"use client";

import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Check, CornerDownLeft, X } from "lucide-react";
import { useId, useState, type ReactNode } from "react";

import { AnswerShape, type AnswerSlot } from "@/components/player/AnswerShape";
import { ItemContent } from "@/components/player/ItemContent";
import { cn } from "@/lib/cn";

import type { Item } from "../shared";
import type { PlayerProps } from "../ui-types";
import type { GroupingAnswer, GroupingConfig, GroupingPublic } from "./definition";

const POOL = "pool";
const slotOf = (index: number) => ((index % 5) + 1) as AnswerSlot;

/**
 * Tap an item, then tap its group — or drag it there. Items can be moved again or
 * sent back to the pool until the answer is submitted.
 */
export function GroupingPlayer({
  data,
  answer,
  onAnswer,
  disabled,
  reveal,
}: PlayerProps<GroupingPublic, GroupingAnswer, GroupingConfig>) {
  const dndId = useId();
  const [active, setActive] = useState<string | null>(null);
  const placement = answer?.placement ?? {};
  const locked = disabled || !!reveal;
  const groupOf = (itemId: string) =>
    Object.hasOwn(placement, itemId) ? placement[itemId] : undefined;
  const correctGroup = new Map(reveal?.items.map((i) => [i.id, i.groupId]));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  function place(itemId: string, groupId: string | null) {
    const next = { ...placement };
    if (groupId) next[itemId] = groupId;
    else delete next[itemId];
    onAnswer({ placement: next });
    setActive(null);
  }

  function onDragEnd({ active: dragged, over }: DragEndEvent) {
    if (!over) return;
    const target = String(over.id);
    place(String(dragged.id), target === POOL ? null : target);
  }

  const chip = (item: Item, index: number) => {
    const placedIn = groupOf(item.id);
    const verdict =
      reveal && placedIn ? (correctGroup.get(item.id) === placedIn ? "right" : "wrong") : null;
    const shouldBe =
      verdict === "wrong" || (reveal && !placedIn)
        ? data.groups.find((g) => g.id === correctGroup.get(item.id))?.name
        : undefined;
    return (
      <DraggableChip
        key={item.id}
        id={item.id}
        disabled={locked}
        active={active === item.id}
        verdict={verdict}
        onClick={() => setActive(active === item.id ? null : item.id)}
        note={shouldBe ? `→ ${shouldBe}` : undefined}
      >
        <ItemContent
          item={item}
          fallback={`Item ${index + 1}`}
          imageClassName="size-10 sm:size-12"
        />
      </DraggableChip>
    );
  };

  const indexOf = new Map(data.items.map((item, i) => [item.id, i]));
  const pool = data.items.filter((item) => !groupOf(item.id));
  const activePlaced = active !== null && groupOf(active) !== undefined;

  return (
    <DndContext id={dndId} sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-col gap-4">
        {!locked && (
          <p className="text-sm font-medium text-fg-muted">
            {active
              ? "Sekarang ketuk kelompoknya."
              : "Ketuk item, lalu ketuk kelompoknya. Bisa juga diseret."}
          </p>
        )}

        <Droppable
          id={POOL}
          className="flex min-h-16 flex-wrap gap-2 rounded-2xl border-2 border-dashed border-line-strong p-3"
          label="Item yang belum dikelompokkan"
        >
          {pool.length === 0 && !activePlaced && (
            <span className="self-center text-sm text-fg-subtle">
              {reveal ? "Semua item sudah dikelompokkan." : "Semua item sudah ditempatkan."}
            </span>
          )}
          {pool.map((item) => chip(item, indexOf.get(item.id)!))}
          {activePlaced && !locked && (
            <button
              type="button"
              onClick={() => place(active, null)}
              className="inline-flex items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-fg-muted hover:text-fg"
            >
              <CornerDownLeft className="size-4" /> Kembalikan ke sini
            </button>
          )}
        </Droppable>

        <div
          className={cn("grid gap-3", data.groups.length > 2 ? "sm:grid-cols-3" : "sm:grid-cols-2")}
        >
          {data.groups.map((group, g) => {
            const items = data.items.filter((item) => groupOf(item.id) === group.id);
            return (
              <Droppable
                key={group.id}
                id={group.id}
                label={group.name}
                className="flex flex-col gap-2 rounded-2xl border-2 border-line bg-surface p-2 shadow-card"
              >
                <button
                  type="button"
                  disabled={locked || !active}
                  onClick={() => active && place(active, group.id)}
                  className={cn(
                    "flex min-h-12 items-center gap-2 rounded-xl px-2 text-left font-semibold transition-colors",
                    active && !locked ? "bg-surface-muted hover:bg-line" : "cursor-default",
                  )}
                  aria-label={active ? `Masukkan ke ${group.name}` : group.name}
                >
                  <AnswerShape slot={slotOf(g)} className="size-8 shrink-0 rounded-lg p-2" />
                  <span className="min-w-0 flex-1 break-words">{group.name}</span>
                  <span className="rounded-full bg-surface-muted px-2 text-xs font-medium text-fg-muted">
                    {items.length}
                  </span>
                </button>
                <div className="flex min-h-12 flex-wrap content-start gap-2">
                  {items.map((item) => chip(item, indexOf.get(item.id)!))}
                </div>
              </Droppable>
            );
          })}
        </div>
      </div>
    </DndContext>
  );
}

function Droppable({
  id,
  label,
  className,
  children,
}: {
  id: string;
  label: string;
  className: string;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      role="group"
      aria-label={label}
      className={cn(className, isOver && "border-theme ring-2 ring-theme/30")}
    >
      {children}
    </div>
  );
}

function DraggableChip({
  id,
  disabled,
  active,
  verdict,
  note,
  onClick,
  children,
}: {
  id: string;
  disabled: boolean;
  active: boolean;
  verdict: "right" | "wrong" | null;
  note?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...attributes}
      {...listeners}
      // After the spread: a native <button> needs no role, and "pressed" means selected here.
      role={undefined}
      aria-pressed={disabled ? undefined : active}
      className={cn(
        "relative inline-flex max-w-full touch-none items-center gap-2 rounded-xl border-2 bg-surface px-3 py-2 text-left text-sm font-medium shadow-card transition-colors",
        active ? "border-fg ring-2 ring-fg/30" : "border-line hover:border-line-strong",
        isDragging && "z-20 cursor-grabbing shadow-pop",
        verdict === "right" && "border-success bg-success-soft",
        verdict === "wrong" && "border-danger bg-danger-soft",
        disabled && !verdict && "cursor-default",
      )}
    >
      {children}
      {verdict === "right" && (
        <Check aria-label="benar" className="size-4 shrink-0 text-success" strokeWidth={3} />
      )}
      {verdict === "wrong" && (
        <X aria-label="salah" className="size-4 shrink-0 text-danger" strokeWidth={3} />
      )}
      {note && <span className="shrink-0 text-xs font-semibold text-success">{note}</span>}
    </button>
  );
}
