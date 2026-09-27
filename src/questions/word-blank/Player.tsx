"use client";

import { Lightbulb } from "lucide-react";
import { useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/cn";

import { normalizeAnswer } from "../short-answer/definition";
import type { PlayerProps } from "../ui-types";
import {
  wordBlankTokens,
  type WordBlankAnswer,
  type WordBlankConfig,
  type WordBlankPublic,
  type WordBlankToken,
} from "./definition";

/**
 * Consecutive tokens between spaces. Words are laid out with a wider gap between them;
 * a word longer than the screen may still wrap, rather than scroll off a phone.
 */
function words(tokens: WordBlankToken[]): { index: number; token: WordBlankToken }[][] {
  const out: { index: number; token: WordBlankToken }[][] = [[]];
  tokens.forEach((token, index) => {
    if (token.kind === "text" && token.text.trim() === "") out.push([]);
    else out.at(-1)!.push({ index, token });
  });
  return out.filter((w) => w.length > 0);
}

export function WordBlankPlayer({
  data,
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<WordBlankPublic, WordBlankAnswer, WordBlankConfig>) {
  const inputs = useRef(new Map<number, HTMLInputElement>());
  const locked = disabled || !!reveal;
  const values = answer?.values ?? {};
  const letters = data.unit === "letter";
  const blankOrder = data.tokens.flatMap((t, i) => (t.kind === "blank" ? [i] : []));
  const truth = reveal ? wordBlankTokens(reveal.text, reveal.unit) : null;
  const valueAt = (i: number) => (Object.hasOwn(values, String(i)) ? values[String(i)]! : "");

  function setValue(index: number, value: string) {
    const next = { ...values, [String(index)]: value };
    if (!value) delete next[String(index)];
    onAnswer({ values: next });
  }

  function focusBlank(from: number, delta: number) {
    const at = blankOrder.indexOf(from) + delta;
    const target = blankOrder[at];
    if (target !== undefined) inputs.current.get(target)?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>, index: number) {
    if (e.key === "Backspace" && e.currentTarget.value === "") {
      e.preventDefault();
      const prev = blankOrder[blankOrder.indexOf(index) - 1];
      if (prev !== undefined) {
        setValue(prev, "");
        inputs.current.get(prev)?.focus();
      }
    } else if (e.key === "ArrowLeft" && e.currentTarget.selectionStart === 0) {
      focusBlank(index, -1);
    } else if (
      e.key === "ArrowRight" &&
      e.currentTarget.selectionEnd === e.currentTarget.value.length
    ) {
      focusBlank(index, 1);
    } else if (e.key === "Enter" && answer && Object.keys(values).length > 0) {
      // Stop the same Enter from also activating the "Lanjut" button that appears next.
      e.preventDefault();
      onCommit?.(answer);
    }
  }

  const blankNumber = new Map(blankOrder.map((tokenIndex, n) => [tokenIndex, n + 1]));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        {words(data.tokens).map((word) => (
          <span key={word[0]!.index} className="flex flex-wrap gap-1">
            {word.map(({ index, token }) => {
              if (token.kind === "text") {
                return (
                  <span
                    key={index}
                    className={cn(
                      "flex h-11 items-center justify-center rounded-xl bg-surface-muted font-semibold text-fg sm:h-14",
                      letters ? "w-9 font-mono text-xl sm:w-12 sm:text-2xl" : "px-3 text-lg",
                    )}
                  >
                    {token.text}
                  </span>
                );
              }
              const value = valueAt(index);
              const expected = truth?.[index];
              const right =
                expected !== undefined &&
                value.trim() !== "" &&
                normalizeAnswer(value, reveal!.caseSensitive) ===
                  normalizeAnswer(expected, reveal!.caseSensitive);
              return (
                <span key={index} className="flex flex-col items-center gap-1">
                  <input
                    ref={(el) => {
                      if (el) inputs.current.set(index, el);
                      else inputs.current.delete(index);
                    }}
                    value={value}
                    disabled={locked}
                    maxLength={letters ? 2 : Math.max(token.length + 10, 20)}
                    onChange={(e) => {
                      // Letter boxes keep the last character typed, then move on.
                      const raw = e.target.value;
                      const next = letters ? (Array.from(raw).at(-1) ?? "") : raw;
                      setValue(index, next);
                      if (letters && next) focusBlank(index, 1);
                    }}
                    onKeyDown={(e) => onKeyDown(e, index)}
                    onFocus={(e) => e.currentTarget.select()}
                    aria-label={`${letters ? "Huruf" : "Kata"} kosong ${blankNumber.get(index)}${letters ? "" : `, ${token.length} huruf`}`}
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={
                      letters ? undefined : { width: `calc(${Math.max(token.length, 3)}ch + 2rem)` }
                    }
                    className={cn(
                      "h-11 rounded-xl border-2 border-dashed bg-surface text-center font-semibold text-fg outline-none focus:border-solid focus:border-theme sm:h-14",
                      letters
                        ? "w-9 font-mono text-xl sm:w-12 sm:text-2xl"
                        : "px-2 font-mono text-lg",
                      !reveal && (value ? "border-solid border-fg/40" : "border-line-strong"),
                      reveal &&
                        (right
                          ? "border-solid border-success bg-success-soft"
                          : "border-solid border-danger bg-danger-soft"),
                    )}
                  />
                  {reveal && !right && expected !== undefined && (
                    <span className="font-mono text-sm font-semibold text-success">{expected}</span>
                  )}
                </span>
              );
            })}
          </span>
        ))}
      </div>
      {data.hint && (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>{data.hint}</span>
        </p>
      )}
    </div>
  );
}
