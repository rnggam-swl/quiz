"use client";

import { ArrowRight, Plus, Trash2, X } from "lucide-react";

import { ItemMediaButton } from "@/components/editor/ItemMediaButton";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createId } from "@/lib/id";

import { withItemMedia, type Item, type MediaRef } from "../shared";
import type { EditorProps } from "../ui-types";
import type { MatchingConfig } from "./definition";

/**
 * Authoring model from the prototype's Item List / Pair List: each item on the
 * left owns one or more pairs; unpaired right items are distractors.
 */
export function MatchingEditor({ config, onChange, invalidPaths }: EditorProps<MatchingConfig>) {
  const rightById = new Map(config.right.map((r) => [r.id, r]));
  const rightIndex = new Map(config.right.map((r, i) => [r.id, i]));
  const pairedRightIds = new Set(config.pairs.map((p) => p.rightId));
  const distractors = config.right.filter((r) => !pairedRightIds.has(r.id));

  const updateItem = (list: Item[], id: string, text: string) =>
    list.map((item) => (item.id === id ? { ...item, text } : item));
  const updateMedia = (list: Item[], id: string, media: MediaRef | undefined) =>
    list.map((item) => (item.id === id ? withItemMedia(item, media) : item));

  function addLeft() {
    const left = { id: createId(), text: "" };
    const right = { id: createId(), text: "" };
    onChange({
      left: [...config.left, left],
      right: [...config.right, right],
      pairs: [...config.pairs, { leftId: left.id, rightId: right.id }],
    });
  }

  function removeLeft(leftId: string) {
    const owned = new Set(config.pairs.filter((p) => p.leftId === leftId).map((p) => p.rightId));
    onChange({
      left: config.left.filter((l) => l.id !== leftId),
      right: config.right.filter((r) => !owned.has(r.id)),
      pairs: config.pairs.filter((p) => p.leftId !== leftId),
    });
  }

  function addPair(leftId: string) {
    const right = { id: createId(), text: "" };
    onChange({
      ...config,
      right: [...config.right, right],
      pairs: [...config.pairs, { leftId, rightId: right.id }],
    });
  }

  function removeRight(rightId: string) {
    onChange({
      ...config,
      right: config.right.filter((r) => r.id !== rightId),
      pairs: config.pairs.filter((p) => p.rightId !== rightId),
    });
  }

  function addDistractor() {
    onChange({ ...config, right: [...config.right, { id: createId(), text: "" }] });
  }

  const rightInput = (right: Item, placeholder: string) => (
    <div key={right.id} className="flex items-center gap-1">
      <Input
        value={right.text}
        onChange={(e) =>
          onChange({ ...config, right: updateItem(config.right, right.id, e.target.value) })
        }
        placeholder={placeholder}
        aria-label={placeholder}
        aria-invalid={invalidPaths?.has(`right.${rightIndex.get(right.id)}.text`) || undefined}
      />
      <ItemMediaButton
        media={right.media}
        onChange={(media) =>
          onChange({ ...config, right: updateMedia(config.right, right.id, media) })
        }
        label={placeholder.toLowerCase()}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Hapus ${placeholder.toLowerCase()}`}
        onClick={() => removeRight(right.id)}
      >
        <X />
      </Button>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface-muted p-3">
        <div className="mb-2 hidden grid-cols-[1fr_20px_1fr_36px] gap-3 px-1 text-xs font-medium text-fg-subtle sm:grid">
          <span>Item</span>
          <span />
          <span>Pasangan</span>
          <span />
        </div>
        <ol className="flex flex-col gap-3">
          {config.left.map((left, index) => {
            const rights = config.pairs
              .filter((p) => p.leftId === left.id)
              .map((p) => rightById.get(p.rightId))
              .filter((r): r is Item => r !== undefined);
            return (
              <li
                key={left.id}
                className="grid grid-cols-1 gap-2 rounded-lg bg-surface p-2 shadow-card sm:grid-cols-[1fr_20px_1fr_36px] sm:items-start sm:gap-3"
              >
                <div className="flex items-center gap-1">
                  <Input
                    value={left.text}
                    onChange={(e) =>
                      onChange({
                        ...config,
                        left: updateItem(config.left, left.id, e.target.value),
                      })
                    }
                    placeholder={`Item ${index + 1}`}
                    aria-label={`Item ${index + 1}`}
                    aria-invalid={
                      invalidPaths?.has(`left.${index}.text`) ||
                      invalidPaths?.has(`left.${index}`) ||
                      undefined
                    }
                  />
                  <ItemMediaButton
                    media={left.media}
                    onChange={(media) =>
                      onChange({ ...config, left: updateMedia(config.left, left.id, media) })
                    }
                    label={`item ${index + 1}`}
                  />
                </div>
                <ArrowRight
                  className="hidden size-5 self-center text-fg-subtle sm:block"
                  aria-hidden
                />
                <div className="flex flex-col gap-2">
                  {rights.map((right, i) =>
                    rightInput(
                      right,
                      `Pasangan ${index + 1}${rights.length > 1 ? `.${i + 1}` : ""}`,
                    ),
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => addPair(left.id)}
                    className="self-start"
                  >
                    <Plus /> Pasangan lain
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus item ${index + 1}`}
                  disabled={config.left.length <= 2}
                  onClick={() => removeLeft(left.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ol>
        <Button variant="secondary" onClick={addLeft} className="mt-3">
          <Plus /> Tambah item
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg-muted">
          Pengecoh{" "}
          <span className="font-normal text-fg-subtle">— pasangan palsu tanpa item (opsional)</span>
        </span>
        {distractors.map((right, i) => rightInput(right, `Pengecoh ${i + 1}`))}
        <Button variant="ghost" size="sm" onClick={addDistractor} className="self-start">
          <Plus /> Tambah pengecoh
        </Button>
      </div>
    </div>
  );
}
