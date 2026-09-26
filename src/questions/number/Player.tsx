"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/cn";

import type { PlayerProps } from "../ui-types";
import {
  numberQuestion,
  parseNumberInput,
  type NumberAnswer,
  type NumberConfig,
  type NumberPublic,
} from "./definition";

export function NumberPlayer({
  data,
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<NumberPublic, NumberAnswer, NumberConfig>) {
  const [text, setText] = useState(() => (answer ? String(answer.value).replace(".", ",") : ""));
  const parsed = parseNumberInput(text);
  const verdict =
    reveal && answer ? numberQuestion.score(reveal, answer).ratio === 1 : reveal ? false : null;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          "flex h-16 items-center rounded-2xl border-2 bg-surface shadow-card focus-within:border-theme",
          verdict === null && "border-line",
          verdict === true && "border-success",
          verdict === false && "border-danger",
        )}
      >
        <input
          inputMode="decimal"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const value = parseNumberInput(e.target.value);
            if (value !== null) onAnswer({ value });
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed !== null) {
              // Stop the same Enter from also activating the "Lanjut" button that appears next.
              e.preventDefault();
              onCommit?.({ value: parsed });
            }
          }}
          disabled={disabled || !!reveal}
          placeholder="0"
          aria-label={data.unit ? `Jawaban dalam ${data.unit}` : "Jawaban angka"}
          aria-invalid={(text.trim() !== "" && parsed === null) || undefined}
          autoComplete="off"
          className="h-full min-w-0 flex-1 rounded-2xl bg-transparent px-5 text-2xl font-semibold text-fg tabular-nums outline-none"
        />
        {data.unit && <span className="pr-5 text-lg font-medium text-fg-muted">{data.unit}</span>}
        {verdict !== null &&
          (verdict ? (
            <Check aria-label="benar" className="mr-4 size-7 text-success" strokeWidth={3} />
          ) : (
            <X aria-label="salah" className="mr-4 size-7 text-danger" strokeWidth={3} />
          ))}
      </div>
      {text.trim() !== "" && parsed === null && !reveal && (
        <p className="text-sm text-danger">Masukkan angka, mis. 12 atau 3,5.</p>
      )}
      {reveal && verdict === false && (
        <p className="text-sm text-fg-muted">
          Jawaban yang benar:{" "}
          <strong className="text-fg">
            {String(reveal.value).replace(".", ",")}
            {reveal.tolerance > 0 && ` ± ${String(reveal.tolerance).replace(".", ",")}`}
            {reveal.unit && ` ${reveal.unit}`}
          </strong>
        </p>
      )}
    </div>
  );
}
