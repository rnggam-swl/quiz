"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/cn";

import type { EditorProps } from "../ui-types";
import type { TrueFalseConfig } from "./definition";

export function TrueFalseEditor({ config, onChange }: EditorProps<TrueFalseConfig>) {
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-3 text-sm font-medium text-fg-muted">
        Jawaban yang benar untuk pernyataan ini
      </legend>
      <div className="grid grid-cols-2 gap-3">
        {[
          { value: true, label: "Benar" },
          { value: false, label: "Salah" },
        ].map(({ value, label }) => {
          const active = config.correct === value;
          return (
            <label
              key={label}
              className={cn(
                "flex cursor-pointer items-center justify-between rounded-xl border-2 bg-surface px-4 py-3 font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                active
                  ? "border-success bg-success-soft text-success"
                  : "border-line text-fg-muted",
              )}
            >
              <input
                type="radio"
                name="tf-correct"
                className="sr-only"
                checked={active}
                onChange={() => onChange({ correct: value })}
              />
              {label}
              {active && <Check className="size-5" strokeWidth={3} aria-hidden />}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
