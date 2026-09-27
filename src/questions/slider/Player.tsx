"use client";

import { Check, Minus, Plus, X } from "lucide-react";
import { useId } from "react";

import { cn } from "@/lib/cn";
import { formatNumber, unitSuffix } from "@/lib/format";

import type { PlayerProps } from "../ui-types";
import {
  positionOf,
  slider,
  snapToStep,
  type SliderAnswer,
  type SliderConfig,
  type SliderPublic,
} from "./definition";

/**
 * A big native range input (keyboard and screen readers for free) with −/+ step
 * buttons. The thumb starts in the middle but only counts once the participant moves it.
 */
export function SliderPlayer({
  data,
  answer,
  onAnswer,
  onCommit,
  disabled,
  reveal,
}: PlayerProps<SliderPublic, SliderAnswer, SliderConfig>) {
  const inputId = useId();
  const locked = disabled || !!reveal;
  const value = answer?.value ?? snapToStep((data.min + data.max) / 2, data);
  const unit = unitSuffix(data.unit);
  const result = reveal && answer ? slider.score(reveal, answer).ratio : null;

  const set = (next: number) => onAnswer({ value: snapToStep(next, data) });

  return (
    <div className="flex flex-col gap-4">
      <output
        htmlFor={inputId}
        aria-live="polite"
        className={cn(
          "flex min-h-16 items-center self-center rounded-2xl px-6 py-2 font-semibold tabular-nums shadow-card",
          answer ? "bg-theme text-4xl text-on-theme" : "bg-surface text-lg text-fg-muted",
        )}
      >
        {answer ? `${formatNumber(value)}${unit}` : "Geser untuk menjawab"}
      </output>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={locked || value <= data.min}
          onClick={() => set(value - data.step)}
          aria-label={`Kurangi ${formatNumber(data.step)}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface text-fg shadow-card hover:border-fg disabled:opacity-40"
        >
          <Minus className="size-5" />
        </button>
        <div className="relative flex-1 py-3">
          {reveal && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2"
            >
              <div
                className="absolute inset-y-0 rounded-full bg-success/40"
                style={{
                  left: `${positionOf(reveal.value - reveal.tolerance, data)}%`,
                  width: `${positionOf(reveal.value + reveal.tolerance, data) - positionOf(reveal.value - reveal.tolerance, data)}%`,
                }}
              />
              <div
                className="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-success"
                style={{ left: `${positionOf(reveal.value, data)}%` }}
              />
            </div>
          )}
          <input
            id={inputId}
            type="range"
            min={data.min}
            max={data.max}
            step={data.step}
            value={value}
            disabled={locked}
            onChange={(e) => set(Number(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && answer) {
                e.preventDefault();
                onCommit?.(answer);
              }
            }}
            aria-label="Jawaban"
            aria-valuetext={`${formatNumber(value)}${unit}`}
            className={cn(
              "relative h-3 w-full cursor-pointer accent-theme disabled:cursor-default",
              !answer && "opacity-60",
            )}
          />
        </div>
        <button
          type="button"
          disabled={locked || value >= data.max}
          onClick={() => set(value + data.step)}
          aria-label={`Tambah ${formatNumber(data.step)}`}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border-2 border-line bg-surface text-fg shadow-card hover:border-fg disabled:opacity-40"
        >
          <Plus className="size-5" />
        </button>
      </div>

      <div className="flex justify-between px-14 text-sm text-fg-muted tabular-nums">
        <span>
          {formatNumber(data.min)}
          {unit}
        </span>
        <span>
          {formatNumber(data.max)}
          {unit}
        </span>
      </div>

      {reveal && (
        <p className="flex items-center gap-2 text-sm text-fg-muted">
          {result === 1 ? (
            <Check aria-label="benar" className="size-5 text-success" strokeWidth={3} />
          ) : (
            <X aria-label="kurang tepat" className="size-5 text-danger" strokeWidth={3} />
          )}
          <span>
            Jawaban yang benar:{" "}
            <strong className="text-fg">
              {formatNumber(reveal.value)}
              {reveal.tolerance > 0 && ` ± ${formatNumber(reveal.tolerance)}`}
              {unit}
            </strong>
            {result !== null && result > 0 && result < 1 && (
              <> — mendekati, dapat {Math.round(result * 100)}% nilai</>
            )}
          </span>
        </p>
      )}
    </div>
  );
}
