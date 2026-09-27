"use client";

import { ChevronDown, ChevronUp, GripVertical, Plus, Trash2 } from "lucide-react";

import { ItemMediaButton } from "@/components/editor/ItemMediaButton";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { moveBy, SortableList } from "@/components/ui/SortableList";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";

import { MAX_ITEMS, withItemMedia, type Item } from "../shared";
import type { EditorProps } from "../ui-types";
import type { SequencingConfig } from "./definition";

export function SequencingEditor({
  config,
  onChange,
  invalidPaths,
}: EditorProps<SequencingConfig>) {
  const setItems = (items: Item[]) => onChange({ ...config, items });
  const update = (id: string, patch: (item: Item) => Item) =>
    setItems(config.items.map((i) => (i.id === id ? patch(i) : i)));

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-medium text-fg-muted">
        Urutan yang benar{" "}
        <span className="font-normal text-fg-subtle">— peserta melihatnya dalam urutan acak</span>
      </span>

      <SortableList
        items={config.items}
        onReorder={setItems}
        itemName={(item, i) => item.text.trim() || `Item ${i + 1}`}
      >
        {(item, index, { handle, isDragging }) => (
          <div
            className={cn(
              "flex items-center gap-2 rounded-xl border border-line bg-surface p-2",
              isDragging && "shadow-pop",
            )}
          >
            <button
              type="button"
              className="flex h-9 w-6 shrink-0 cursor-grab touch-none items-center justify-center rounded text-fg-subtle hover:bg-surface-muted active:cursor-grabbing"
              aria-label={`Pindahkan item ${index + 1}`}
              {...handle}
            >
              <GripVertical className="size-4" />
            </button>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-fg-muted">
              {index + 1}
            </span>
            <Input
              value={item.text}
              onChange={(e) => update(item.id, (i) => ({ ...i, text: e.target.value }))}
              placeholder={item.media ? "Teks (opsional)" : `Item ${index + 1}`}
              aria-label={`Teks item ${index + 1}`}
              aria-invalid={invalidPaths?.has(`items.${index}.text`) || undefined}
              className="border-transparent bg-transparent hover:border-line"
            />
            <ItemMediaButton
              media={item.media}
              onChange={(media) => update(item.id, (i) => withItemMedia(i, media))}
              label={`item ${index + 1}`}
            />
            <div className="flex shrink-0 flex-col">
              <button
                type="button"
                disabled={index === 0}
                onClick={() => setItems(moveBy(config.items, index, -1))}
                aria-label={`Naikkan item ${index + 1}`}
                className="rounded text-fg-subtle hover:text-fg disabled:opacity-30"
              >
                <ChevronUp className="size-4" />
              </button>
              <button
                type="button"
                disabled={index === config.items.length - 1}
                onClick={() => setItems(moveBy(config.items, index, 1))}
                aria-label={`Turunkan item ${index + 1}`}
                className="rounded text-fg-subtle hover:text-fg disabled:opacity-30"
              >
                <ChevronDown className="size-4" />
              </button>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setItems(config.items.filter((i) => i.id !== item.id))}
              disabled={config.items.length <= 3}
              aria-label={`Hapus item ${index + 1}`}
              className="shrink-0"
            >
              <Trash2 />
            </Button>
          </div>
        )}
      </SortableList>

      {config.items.length < MAX_ITEMS && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setItems([...config.items, { id: createId(), text: "" }])}
        >
          <Plus /> Tambah item
        </Button>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="seq-scoring">Cara menilai</Label>
        <Select
          id="seq-scoring"
          value={config.scoring}
          onChange={(e) =>
            onChange({ ...config, scoring: e.target.value as SequencingConfig["scoring"] })
          }
        >
          <option value="adjacent">Pasangan berurutan (disarankan)</option>
          <option value="position">Posisi persis</option>
        </Select>
        <p className="text-xs text-fg-subtle">
          {config.scoring === "adjacent"
            ? "Nilai dari setiap dua item yang berurutan dengan benar. Satu item yang salah tempat hanya mengurangi sedikit nilai."
            : "Nilai dari setiap item yang tepat di posisinya. Satu item yang tergeser bisa membuat banyak posisi salah."}
        </p>
      </div>
    </div>
  );
}
