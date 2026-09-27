"use client";

import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/cn";

import type { EditorProps } from "../ui-types";
import {
  activeBlanks,
  MAX_WORD_BLANK_TEXT,
  wordBlankTokens,
  type WordBlankConfig,
  type WordBlankUnit,
} from "./definition";

export function WordBlankEditor({ config, onChange, invalidPaths }: EditorProps<WordBlankConfig>) {
  const tokens = wordBlankTokens(config.text, config.unit);
  const blanks = new Set(activeBlanks(config));

  function toggle(index: number) {
    const next = new Set(blanks);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    onChange({ ...config, blanks: [...next].sort((a, b) => a - b) });
  }

  function setUnit(unit: WordBlankUnit) {
    if (unit !== config.unit) onChange({ ...config, unit, blanks: [] });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wb-text">Jawaban lengkap</Label>
        <Input
          id="wb-text"
          value={config.text}
          maxLength={MAX_WORD_BLANK_TEXT}
          placeholder="mis. Fotosintesis"
          aria-invalid={invalidPaths?.has("text") || undefined}
          onChange={(e) => {
            const text = e.target.value;
            // Keep blanks that still point at a letter/word; indexes past the end go.
            onChange({ ...config, text, blanks: activeBlanks({ ...config, text }) });
          }}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg">Sembunyikan per</span>
        <div
          role="radiogroup"
          aria-label="Sembunyikan per"
          className="flex w-fit rounded-lg bg-surface-muted p-1"
        >
          {(
            [
              ["letter", "Huruf"],
              ["word", "Kata"],
            ] as const
          ).map(([unit, label]) => (
            <button
              key={unit}
              type="button"
              role="radio"
              aria-checked={config.unit === unit}
              onClick={() => setUnit(unit)}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
                config.unit === unit
                  ? "bg-surface text-fg shadow-card"
                  : "text-fg-muted hover:text-fg",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-fg">
          Pilih yang disembunyikan{" "}
          <span className="font-normal text-fg-subtle">
            — ketuk untuk menyembunyikan/menampilkan
          </span>
        </span>
        {tokens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-fg-subtle">
            Tulis jawaban lengkap dulu.
          </p>
        ) : (
          <div
            className={cn(
              "flex flex-wrap gap-1.5 rounded-xl bg-surface-muted p-3",
              invalidPaths?.has("blanks") && "ring-2 ring-danger",
            )}
          >
            {tokens.map((token, i) =>
              token.trim() === "" ? (
                <span key={i} aria-hidden className="w-3" />
              ) : (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={blanks.has(i)}
                  aria-label={`${config.unit === "word" ? "Kata" : "Huruf"} "${token}"${blanks.has(i) ? ", disembunyikan" : ""}`}
                  className={cn(
                    "flex h-10 min-w-10 items-center justify-center rounded-lg border-2 px-2 font-mono text-lg font-semibold transition-colors",
                    blanks.has(i)
                      ? "border-dashed border-accent bg-accent-soft text-accent-fg"
                      : "border-line bg-surface text-fg hover:border-line-strong",
                  )}
                >
                  {blanks.has(i) ? <span className="opacity-60">{token}</span> : token}
                </button>
              ),
            )}
          </div>
        )}
        <p className="text-xs text-fg-subtle">
          {blanks.size} {config.unit === "word" ? "kata" : "huruf"} disembunyikan. Peserta hanya
          melihat panjangnya.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wb-hint">Petunjuk (opsional)</Label>
        <Input
          id="wb-hint"
          value={config.hint ?? ""}
          maxLength={200}
          placeholder="mis. Proses tumbuhan membuat makanan"
          onChange={(e) => {
            const next: WordBlankConfig = { ...config, hint: e.target.value };
            if (!next.hint) delete next.hint;
            onChange(next);
          }}
        />
      </div>

      <div className="flex items-center justify-between gap-4">
        <Label htmlFor="wb-case">Huruf besar/kecil harus sama</Label>
        <Switch
          id="wb-case"
          checked={config.caseSensitive}
          onCheckedChange={(caseSensitive) => onChange({ ...config, caseSensitive })}
        />
      </div>
    </div>
  );
}
