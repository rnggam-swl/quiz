"use client";

import { Check, RotateCcw, X } from "lucide-react";
import { useState } from "react";

import { AnswerShape, type AnswerSlot } from "@/components/player/AnswerShape";
import { cn } from "@/lib/cn";

import type { PlayerProps } from "../ui-types";
import type { MatchingAnswer, MatchingConfig, MatchingPublic, MatchPair } from "./definition";

const slotOf = (index: number) => ((index % 5) + 1) as AnswerSlot;
const same = (a: MatchPair, b: MatchPair) => a.leftId === b.leftId && a.rightId === b.rightId;

/**
 * Tap an item on the left, then tap its pair(s) on the right. Each item has its
 * own colour + shape, and connected pairs carry the same badge — no lines to
 * draw, so it works the same on a phone and on a projector.
 */
export function MatchingPlayer({
  data,
  answer,
  onAnswer,
  disabled,
  reveal,
}: PlayerProps<MatchingPublic, MatchingAnswer, MatchingConfig>) {
  const [active, setActive] = useState<string | null>(null);
  const pairs = answer?.pairs ?? [];
  const locked = disabled || !!reveal;
  const leftSlot = new Map(data.left.map((l, i) => [l.id, slotOf(i)]));
  const isKey = (p: MatchPair) => !!reveal?.pairs.some((k) => same(k, p));

  function toggle(rightId: string) {
    if (!active) return;
    const pair = { leftId: active, rightId };
    const next = pairs.some((p) => same(p, pair))
      ? pairs.filter((p) => !same(p, pair))
      : [...pairs, pair];
    onAnswer({ pairs: next });
  }

  const missed = reveal ? reveal.pairs.filter((k) => !pairs.some((p) => same(p, k))) : [];
  const textOf = (list: { id: string; text: string }[], id: string) =>
    list.find((x) => x.id === id)?.text ?? "";

  return (
    <div className="flex flex-col gap-4">
      {!locked && (
        <p className="text-sm font-medium text-fg-muted">
          {active
            ? "Sekarang ketuk pasangannya di kanan."
            : "Ketuk item di kiri, lalu pasangannya di kanan."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 sm:gap-6">
        <ul className="flex flex-col gap-2" aria-label="Item">
          {data.left.map((left, i) => {
            const isActive = active === left.id;
            const count = pairs.filter((p) => p.leftId === left.id).length;
            return (
              <li key={left.id}>
                <button
                  type="button"
                  disabled={locked}
                  aria-pressed={isActive}
                  onClick={() => setActive(isActive ? null : left.id)}
                  className={cn(
                    "flex min-h-14 w-full items-center gap-2 rounded-xl border-2 bg-surface px-3 py-2 text-left font-medium shadow-card transition",
                    isActive
                      ? "border-fg ring-2 ring-fg/30"
                      : "border-line hover:border-line-strong",
                  )}
                >
                  <AnswerShape slot={slotOf(i)} className="size-7 shrink-0 rounded-md p-1.5" />
                  <span className="min-w-0 flex-1 break-words">{left.text || `Item ${i + 1}`}</span>
                  {count > 0 && (
                    <span className="rounded-full bg-surface-muted px-2 text-xs text-fg-muted">
                      {count}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="flex flex-col gap-2" aria-label="Pasangan">
          {data.right.map((right, i) => {
            const connected = pairs.filter((p) => p.rightId === right.id);
            return (
              <li key={right.id}>
                <button
                  type="button"
                  disabled={locked || !active}
                  onClick={() => toggle(right.id)}
                  aria-pressed={active ? connected.some((p) => p.leftId === active) : undefined}
                  className={cn(
                    "flex min-h-14 w-full flex-wrap items-center gap-2 rounded-xl border-2 border-line bg-surface px-3 py-2 text-left shadow-card transition",
                    active && !locked && "hover:border-fg",
                    !active && !locked && "cursor-default",
                  )}
                >
                  <span className="min-w-0 flex-1 break-words">
                    {right.text || `Pasangan ${i + 1}`}
                  </span>
                  <span className="flex gap-1">
                    {connected.map((p) => (
                      <span key={p.leftId} className="relative">
                        <AnswerShape
                          slot={leftSlot.get(p.leftId) ?? 1}
                          className="size-6 rounded-md p-1"
                        />
                        {reveal && (
                          <span
                            className={cn(
                              "absolute -right-1 -bottom-1 rounded-full text-white",
                              isKey(p) ? "bg-success" : "bg-danger",
                            )}
                          >
                            {isKey(p) ? (
                              <Check aria-label="benar" className="size-3" strokeWidth={4} />
                            ) : (
                              <X aria-label="salah" className="size-3" strokeWidth={4} />
                            )}
                          </span>
                        )}
                      </span>
                    ))}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {!locked && pairs.length > 0 && (
        <button
          type="button"
          onClick={() => {
            onAnswer({ pairs: [] });
            setActive(null);
          }}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-fg-muted hover:text-fg"
        >
          <RotateCcw className="size-4" /> Ulangi
        </button>
      )}

      {missed.length > 0 && (
        <div className="rounded-xl bg-success-soft p-3 text-sm">
          <p className="mb-1 font-semibold text-success">Pasangan yang terlewat:</p>
          <ul className="list-inside list-disc text-fg">
            {missed.map((k) => (
              <li key={`${k.leftId}-${k.rightId}`}>
                {textOf(data.left, k.leftId)} → {textOf(reveal!.right, k.rightId)}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
