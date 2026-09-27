"use client";

import { BookOpenCheck } from "lucide-react";
import { useId } from "react";

import { cn } from "@/lib/cn";

import type { PlayerProps } from "../ui-types";
import { countWords, type EssayAnswer, type EssayConfig, type EssayPublic } from "./definition";

export function EssayPlayer({
  data,
  answer,
  onAnswer,
  disabled,
  reveal,
}: PlayerProps<EssayPublic, EssayAnswer, EssayConfig>) {
  const counterId = useId();
  const text = answer?.text ?? "";
  const words = countWords(text);
  const tooShort = data.minWords !== null && words > 0 && words < data.minWords;
  const tooLong = data.maxWords !== null && words > data.maxWords;
  const limits = [
    data.minWords !== null && `min. ${data.minWords}`,
    data.maxWords !== null && `maks. ${data.maxWords}`,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => onAnswer({ text: e.target.value })}
        disabled={disabled || !!reveal}
        rows={10}
        maxLength={20_000}
        placeholder="Tulis jawabanmu di sini…"
        aria-label="Jawaban esai"
        aria-describedby={counterId}
        className="min-h-48 w-full resize-y rounded-2xl border-2 border-line bg-surface p-4 text-base leading-relaxed text-fg shadow-card outline-none focus:border-theme disabled:opacity-80"
      />
      <p
        id={counterId}
        aria-live="polite"
        className={cn(
          "self-end text-sm tabular-nums",
          tooShort || tooLong ? "font-medium text-danger" : "text-fg-muted",
        )}
      >
        {words} kata{limits.length > 0 && ` (${limits.join(", ")})`}
        {tooShort && " — masih kurang"}
        {tooLong && " — terlalu panjang"}
      </p>
      {reveal && (
        <div className="flex flex-col gap-1 rounded-xl bg-surface-muted p-3 text-sm">
          <p className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <BookOpenCheck className="size-4" aria-hidden /> Dinilai oleh guru
          </p>
          {reveal.guide.trim() && (
            <p className="whitespace-pre-line text-fg-muted">{reveal.guide}</p>
          )}
        </div>
      )}
    </div>
  );
}
