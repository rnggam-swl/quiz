"use client";

import { Check, Plus, Trash2 } from "lucide-react";
import { useRef } from "react";

import { ItemMediaButton } from "@/components/editor/ItemMediaButton";
import { AnswerShape, type AnswerSlot } from "@/components/player/AnswerShape";
import { Button } from "@/components/ui/Button";
import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";
import { createId } from "@/lib/id";

import { withItemMedia, type MediaRef } from "../shared";
import type { EditorProps } from "../ui-types";
import { MAX_OPTIONS, type MultipleChoiceConfig } from "./definition";

export function MultipleChoiceEditor({
  config,
  onChange,
  invalidPaths,
}: EditorProps<MultipleChoiceConfig>) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const correct = new Set(config.correctIds);

  function setText(id: string, text: string) {
    onChange({ ...config, options: config.options.map((o) => (o.id === id ? { ...o, text } : o)) });
  }

  function setMedia(id: string, media: MediaRef | undefined) {
    onChange({
      ...config,
      options: config.options.map((o) => (o.id === id ? withItemMedia(o, media) : o)),
    });
  }

  function toggleCorrect(id: string) {
    if (config.multiple) {
      const next = correct.has(id)
        ? config.correctIds.filter((c) => c !== id)
        : [...config.correctIds, id];
      onChange({ ...config, correctIds: next });
    } else {
      onChange({ ...config, correctIds: [id] });
    }
  }

  function addOption(afterIndex = config.options.length - 1) {
    if (config.options.length >= MAX_OPTIONS) return;
    const option = { id: createId(), text: "" };
    const options = [...config.options];
    options.splice(afterIndex + 1, 0, option);
    onChange({ ...config, options });
    requestAnimationFrame(() => inputs.current.get(option.id)?.focus());
  }

  function removeOption(id: string) {
    onChange({
      ...config,
      options: config.options.filter((o) => o.id !== id),
      correctIds: config.correctIds.filter((c) => c !== id),
    });
  }

  function setMultiple(multiple: boolean) {
    // Going back to single answer keeps only the first marked option.
    const correctIds = multiple ? config.correctIds : config.correctIds.slice(0, 1);
    onChange({ ...config, multiple, correctIds });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-fg-muted">
          Opsi jawaban{" "}
          <span className="font-normal text-fg-subtle">
            — {config.multiple ? "tandai semua yang benar" : "tandai satu yang benar"}
          </span>
        </span>
        <div className="flex items-center gap-2">
          <Label htmlFor="mc-multiple" className="text-xs font-normal text-fg-muted">
            Beberapa jawaban benar
          </Label>
          <Switch id="mc-multiple" checked={config.multiple} onCheckedChange={setMultiple} />
        </div>
      </div>

      {invalidPaths?.has("correctIds") && (
        <p className="text-xs text-danger">Tandai jawaban yang benar.</p>
      )}

      <ol className="flex flex-col gap-2">
        {config.options.map((option, index) => {
          const slot = ((index % 5) + 1) as AnswerSlot;
          const isCorrect = correct.has(option.id);
          const invalid = invalidPaths?.has(`options.${index}.text`);
          return (
            <li
              key={option.id}
              className={cn(
                "flex items-center gap-2 rounded-xl border bg-surface p-2 transition-colors",
                isCorrect ? "border-success bg-success-soft" : "border-line",
              )}
            >
              <AnswerShape slot={slot} className="size-8 shrink-0 rounded-lg p-2" />
              <Input
                ref={(el) => {
                  if (el) inputs.current.set(option.id, el);
                  else inputs.current.delete(option.id);
                }}
                value={option.text}
                onChange={(e) => setText(option.id, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    addOption(index);
                  }
                }}
                placeholder={option.media ? "Teks (opsional)" : `Opsi ${index + 1}`}
                aria-label={`Teks opsi ${index + 1}`}
                aria-invalid={invalid || undefined}
                className="border-transparent bg-transparent hover:border-line"
              />
              <ItemMediaButton
                media={option.media}
                onChange={(media) => setMedia(option.id, media)}
                label={`opsi ${index + 1}`}
              />
              <button
                type="button"
                onClick={() => toggleCorrect(option.id)}
                aria-pressed={isCorrect}
                aria-label={
                  isCorrect ? `Opsi ${index + 1} benar` : `Tandai opsi ${index + 1} benar`
                }
                title={isCorrect ? "Jawaban benar" : "Tandai sebagai jawaban benar"}
                className={cn(
                  "inline-flex size-8 shrink-0 items-center justify-center border-2 transition-colors",
                  config.multiple ? "rounded-md" : "rounded-full",
                  isCorrect
                    ? "border-success bg-success text-white"
                    : "border-line-strong text-transparent hover:border-success hover:text-success",
                )}
              >
                <Check className="size-4" strokeWidth={3} />
              </button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeOption(option.id)}
                disabled={config.options.length <= 2}
                aria-label={`Hapus opsi ${index + 1}`}
                className="shrink-0"
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ol>

      {config.options.length < MAX_OPTIONS && (
        <Button variant="secondary" onClick={() => addOption()} className="self-start">
          <Plus /> Tambah opsi
        </Button>
      )}
    </div>
  );
}
