"use client";

import { Plus, Trash2, Unlink } from "lucide-react";

import { ItemMediaButton } from "@/components/editor/ItemMediaButton";
import { AnswerShape, type AnswerSlot } from "@/components/player/AnswerShape";
import { Button } from "@/components/ui/Button";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";

import { withItemMedia, type Item } from "../shared";
import type { EditorProps } from "../ui-types";
import { MAX_ODD_ITEMS, type OddOneOutConfig } from "./definition";

export function OddOneOutEditor({ config, onChange, invalidPaths }: EditorProps<OddOneOutConfig>) {
  const update = (id: string, patch: (item: Item) => Item) =>
    onChange({ ...config, items: config.items.map((i) => (i.id === id ? patch(i) : i)) });

  function remove(id: string) {
    onChange({
      ...config,
      items: config.items.filter((i) => i.id !== id),
      oddId: config.oddId === id ? "" : config.oddId,
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-medium text-fg-muted">
        Item <span className="font-normal text-fg-subtle">— tandai satu yang tidak cocok</span>
      </span>
      {invalidPaths?.has("oddId") && (
        <p className="text-xs text-danger">Tandai item yang tidak cocok.</p>
      )}
      <ol className="flex flex-col gap-2">
        {config.items.map((item, index) => {
          const isOdd = config.oddId === item.id;
          return (
            <li
              key={item.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-surface p-2 transition-colors",
                isOdd ? "border-warning bg-warning-soft" : "border-line",
              )}
            >
              <AnswerShape
                slot={((index % 5) + 1) as AnswerSlot}
                className="size-8 shrink-0 rounded-lg p-2"
              />
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
              <button
                type="button"
                onClick={() => onChange({ ...config, oddId: item.id })}
                aria-pressed={isOdd}
                aria-label={
                  isOdd
                    ? `Item ${index + 1} yang tidak cocok`
                    : `Tandai item ${index + 1} tidak cocok`
                }
                title={isOdd ? "Item yang tidak cocok" : "Tandai sebagai yang tidak cocok"}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  isOdd
                    ? "border-warning bg-warning text-canvas"
                    : "border-line-strong text-fg-subtle hover:border-warning hover:text-warning",
                )}
              >
                <Unlink className="size-4" strokeWidth={2.5} />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(item.id)}
                disabled={config.items.length <= 3}
                aria-label={`Hapus item ${index + 1}`}
                className="shrink-0"
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ol>
      {config.items.length < MAX_ODD_ITEMS && (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() =>
            onChange({ ...config, items: [...config.items, { id: createId(), text: "" }] })
          }
        >
          <Plus /> Tambah item
        </Button>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="odd-reason">Alasan (opsional)</Label>
        <Textarea
          id="odd-reason"
          rows={2}
          maxLength={500}
          value={config.reason ?? ""}
          placeholder="mis. Bulan adalah satelit, bukan planet."
          onChange={(e) => {
            const next: OddOneOutConfig = { ...config, reason: e.target.value };
            if (!next.reason) delete next.reason;
            onChange(next);
          }}
        />
        <p className="text-xs text-fg-subtle">Ditampilkan ke peserta setelah menjawab.</p>
      </div>
    </div>
  );
}
