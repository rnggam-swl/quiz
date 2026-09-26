"use client";

import { Check, X } from "lucide-react";

import { cn } from "@/lib/cn";

import type { PlayerProps } from "../ui-types";
import {
  shortAnswer,
  type ShortAnswerAnswer,
  type ShortAnswerConfig,
  type ShortAnswerPublic,
} from "./definition";

export function ShortAnswerPlayer({
  data,
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<ShortAnswerPublic, ShortAnswerAnswer, ShortAnswerConfig>) {
  const text = answer?.text ?? "";
  const verdict = reveal ? shortAnswer.score(reveal, { text }).ratio === 1 : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <input
          value={text}
          onChange={(e) => onAnswer({ text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && text.trim()) {
              // Stop the same Enter from also activating the "Lanjut" button that appears next.
              e.preventDefault();
              onCommit?.({ text });
            }
          }}
          maxLength={data.maxLength}
          disabled={disabled || !!reveal}
          placeholder="Ketik jawabanmu…"
          aria-label="Jawaban"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          className={cn(
            "h-16 w-full rounded-2xl border-2 bg-surface px-5 text-xl font-semibold text-fg shadow-card outline-none focus-visible:border-theme",
            verdict === null && "border-line",
            verdict === true && "border-success pr-14",
            verdict === false && "border-danger pr-14",
          )}
        />
        {verdict !== null && (
          <span
            className={cn(
              "absolute top-1/2 right-4 -translate-y-1/2",
              verdict ? "text-success" : "text-danger",
            )}
          >
            {verdict ? (
              <Check aria-label="benar" className="size-7" strokeWidth={3} />
            ) : (
              <X aria-label="salah" className="size-7" strokeWidth={3} />
            )}
          </span>
        )}
      </div>
      {reveal && verdict === false && (
        <p className="text-sm text-fg-muted">
          Jawaban yang benar:{" "}
          <strong className="text-fg">{reveal.accepted.filter(Boolean).join(" / ")}</strong>
        </p>
      )}
    </div>
  );
}
