"use client";

import { Plus, Trash2, X } from "lucide-react";

import { ItemMediaButton } from "@/components/editor/ItemMediaButton";
import { AnswerShape, type AnswerSlot } from "@/components/player/AnswerShape";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createId } from "@/lib/id";

import { MAX_ITEMS, withItemMedia } from "../shared";
import type { EditorProps } from "../ui-types";
import { MAX_GROUPS, type GroupingConfig } from "./definition";

type GroupItem = GroupingConfig["items"][number];

/** One card per group with its items; the player shuffles all items into one pool. */
export function GroupingEditor({ config, onChange, invalidPaths }: EditorProps<GroupingConfig>) {
  const itemIndex = new Map(config.items.map((item, i) => [item.id, i]));
  const updateItem = (id: string, patch: (item: GroupItem) => GroupItem) =>
    onChange({ ...config, items: config.items.map((i) => (i.id === id ? patch(i) : i)) });

  function addGroup() {
    const group = { id: createId(), name: "" };
    onChange({
      groups: [...config.groups, group],
      items: [...config.items, { id: createId(), text: "", groupId: group.id }],
    });
  }

  function removeGroup(groupId: string) {
    onChange({
      groups: config.groups.filter((g) => g.id !== groupId),
      items: config.items.filter((i) => i.groupId !== groupId),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <span className="text-sm font-medium text-fg-muted">
        Kelompok & item{" "}
        <span className="font-normal text-fg-subtle">— peserta melihat semua item diacak</span>
      </span>
      <div className="grid gap-3 sm:grid-cols-2">
        {config.groups.map((group, g) => {
          const items = config.items.filter((i) => i.groupId === group.id);
          return (
            <section
              key={group.id}
              aria-label={`Kelompok ${g + 1}`}
              className="flex flex-col gap-2 rounded-xl bg-surface-muted p-3"
            >
              <div className="flex items-center gap-2">
                <AnswerShape
                  slot={((g % 5) + 1) as AnswerSlot}
                  className="size-8 shrink-0 rounded-lg p-2"
                />
                <Input
                  value={group.name}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      groups: config.groups.map((x) =>
                        x.id === group.id ? { ...x, name: e.target.value } : x,
                      ),
                    })
                  }
                  maxLength={100}
                  placeholder={`Nama kelompok ${g + 1}`}
                  aria-label={`Nama kelompok ${g + 1}`}
                  aria-invalid={
                    invalidPaths?.has(`groups.${g}.name`) ||
                    invalidPaths?.has(`groups.${g}`) ||
                    undefined
                  }
                  className="font-semibold"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={config.groups.length <= 2}
                  onClick={() => removeGroup(group.id)}
                  aria-label={`Hapus kelompok ${g + 1}`}
                >
                  <Trash2 />
                </Button>
              </div>
              <ul className="flex flex-col gap-1.5">
                {items.map((item, i) => {
                  const index = itemIndex.get(item.id)!;
                  const label = `item ${i + 1} kelompok ${g + 1}`;
                  return (
                    <li key={item.id} className="flex items-center gap-1 rounded-lg bg-surface p-1">
                      <Input
                        value={item.text}
                        onChange={(e) =>
                          updateItem(item.id, (x) => ({ ...x, text: e.target.value }))
                        }
                        placeholder={item.media ? "Teks (opsional)" : `Item ${i + 1}`}
                        aria-label={`Teks ${label}`}
                        aria-invalid={invalidPaths?.has(`items.${index}.text`) || undefined}
                        className="border-transparent bg-transparent hover:border-line"
                      />
                      <ItemMediaButton
                        media={item.media}
                        onChange={(media) => updateItem(item.id, (x) => withItemMedia(x, media))}
                        label={label}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          onChange({
                            ...config,
                            items: config.items.filter((x) => x.id !== item.id),
                          })
                        }
                        aria-label={`Hapus ${label}`}
                      >
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {config.items.length < MAX_ITEMS && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="self-start"
                  onClick={() =>
                    onChange({
                      ...config,
                      items: [...config.items, { id: createId(), text: "", groupId: group.id }],
                    })
                  }
                >
                  <Plus /> Tambah item
                </Button>
              )}
            </section>
          );
        })}
      </div>
      {config.groups.length < MAX_GROUPS && config.items.length < MAX_ITEMS && (
        <Button variant="secondary" className="self-start" onClick={addGroup}>
          <Plus /> Tambah kelompok
        </Button>
      )}
    </div>
  );
}
