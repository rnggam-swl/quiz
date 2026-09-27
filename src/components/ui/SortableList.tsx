"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/** dnd-kit's attributes + listeners, to spread on the row's handle <button>. */
export type DragHandleProps = ButtonHTMLAttributes<HTMLButtonElement>;

type SortableListProps<T extends { id: string }> = {
  items: T[];
  onReorder: (items: T[]) => void;
  /** Spoken name of an item, for drag announcements ("Langkah A"). */
  itemName: (item: T, index: number) => string;
  disabled?: boolean;
  className?: string;
  children: (
    item: T,
    index: number,
    drag: { handle: DragHandleProps; isDragging: boolean },
  ) => ReactNode;
};

const screenReaderInstructions = {
  draggable:
    "Tekan spasi atau Enter untuk mengangkat. Pakai panah atas/bawah untuk memindahkan, spasi atau Enter untuk meletakkan, Escape untuk batal.",
};

/** Move one item up or down by `delta`, for the ▲▼ buttons next to a drag handle. */
export function moveBy<T>(items: T[], index: number, delta: number): T[] {
  const to = index + delta;
  return to < 0 || to >= items.length ? items : arrayMove(items, index, to);
}

/**
 * A vertical list reorderable by drag (mouse, touch, keyboard) — the rows supply their
 * own handle (give it `touch-none` so touch drags don't scroll the page) and usually
 * ▲▼ buttons (`moveBy`) as a no-drag alternative.
 */
export function SortableList<T extends { id: string }>({
  items,
  onReorder,
  itemName,
  disabled,
  className,
  children,
}: SortableListProps<T>) {
  // Stable across server/client and unique when several lists share a page (results review).
  const id = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const nameOf = (itemId: string | number) => {
    const index = items.findIndex((i) => i.id === itemId);
    return index === -1 ? "Item" : itemName(items[index]!, index);
  };
  const positionOf = (itemId: string | number) => items.findIndex((i) => i.id === itemId) + 1;

  const announcements: Announcements = {
    onDragStart: ({ active }) => `${nameOf(active.id)} diangkat, posisi ${positionOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nameOf(active.id)} di posisi ${positionOf(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${nameOf(active.id)} diletakkan di posisi ${positionOf(over.id)}.`
        : `${nameOf(active.id)} diletakkan.`,
    onDragCancel: ({ active }) => `Batal. ${nameOf(active.id)} kembali ke posisi semula.`,
  };

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from !== -1 && to !== -1) onReorder(arrayMove(items, from, to));
  }

  return (
    <DndContext
      id={id}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{ announcements, screenReaderInstructions }}
    >
      <SortableContext
        items={items.map((i) => i.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <ol className={cn("flex flex-col gap-2", className)}>
          {items.map((item, index) => (
            <SortableRow key={item.id} id={item.id}>
              {(drag) => children(item, index, drag)}
            </SortableRow>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: (drag: { handle: DragHandleProps; isDragging: boolean }) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10")}
    >
      {children({ handle: { ...attributes, ...listeners } as DragHandleProps, isDragging })}
    </li>
  );
}
