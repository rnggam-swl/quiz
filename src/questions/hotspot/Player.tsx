"use client";

import { Crosshair, RotateCcw } from "lucide-react";
import { useState, type KeyboardEvent, type MouseEvent } from "react";

import { cn } from "@/lib/cn";

import type { PlayerProps } from "../ui-types";
import {
  judgeClicks,
  type HotspotAnswer,
  type HotspotClick,
  type HotspotConfig,
  type HotspotPublic,
} from "./definition";

const clamp = (n: number) => Math.min(100, Math.max(0, n));
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Click (or tap) the picture to place markers, up to the allowance; tap a marker to
 * take it back. Keyboard: focus the picture, move the crosshair with the arrows,
 * Enter/Space to place.
 */
export function HotspotPlayer({
  data,
  answer,
  onAnswer,
  disabled,
  reveal,
}: PlayerProps<HotspotPublic, HotspotAnswer, HotspotConfig>) {
  const [cursor, setCursor] = useState<HotspotClick | null>(null);
  const clicks = answer?.clicks ?? [];
  const locked = disabled || !!reveal;
  const full = clicks.length >= data.maxClicks;
  const judged = reveal ? judgeClicks(reveal, clicks).results : null;

  function add(click: HotspotClick) {
    if (locked || full) return;
    onAnswer({ clicks: [...clicks, { x: round1(click.x), y: round1(click.y) }] });
  }

  function onPictureClick(e: MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    add({
      x: clamp(((e.clientX - rect.left) / rect.width) * 100),
      y: clamp(((e.clientY - rect.top) / rect.height) * 100),
    });
  }

  function onPictureKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    const at = cursor ?? { x: 50, y: 50 };
    const step = e.shiftKey ? 10 : 3;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      setCursor({ x: clamp(at.x + move[0]), y: clamp(at.y + move[1]) });
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      add(at);
    }
  }

  if (!data.image) {
    return <p className="text-sm text-fg-subtle italic">Gambar belum diunggah.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {!reveal && (
        <p className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium text-fg-muted">
          <span>
            Temukan {data.spotCount} bagian di gambar. Klik yang meleset mengurangi nilai.
          </span>
          <span aria-live="polite" className="rounded-full bg-surface-muted px-3 py-1 tabular-nums">
            {clicks.length}/{data.maxClicks} klik
          </span>
        </p>
      )}

      <div
        role="group"
        tabIndex={locked ? -1 : 0}
        aria-label={`${data.image.alt || "Gambar"}. Pakai panah untuk memindahkan penanda, Enter untuk menandai.`}
        onClick={onPictureClick}
        onKeyDown={onPictureKey}
        onBlur={() => setCursor(null)}
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 border-line shadow-card outline-none select-none focus-visible:border-theme focus-visible:ring-4 focus-visible:ring-theme/30",
          !locked && !full && "cursor-crosshair",
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Storage */}
        <img
          src={data.image.url}
          alt=""
          draggable={false}
          className="pointer-events-none block h-auto w-full"
        />

        {reveal?.spots.map((spot) => (
          <span
            key={spot.id}
            aria-hidden
            className="absolute aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-success bg-success/20"
            style={{ left: `${spot.x}%`, top: `${spot.y}%`, width: `${spot.r * 2}%` }}
          />
        ))}

        {clicks.map((click, i) => {
          const result = judged?.[i]?.result;
          const ignored = judged !== null && judged[i] === undefined;
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={(e) => {
                e.stopPropagation();
                onAnswer({ clicks: clicks.filter((_, j) => j !== i) });
              }}
              aria-label={
                result === "found"
                  ? `Penanda ${i + 1}: tepat`
                  : result === "miss"
                    ? `Penanda ${i + 1}: meleset`
                    : `Penanda ${i + 1}${locked ? "" : ", ketuk untuk menghapus"}`
              }
              className={cn(
                "absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-sm font-bold shadow-pop",
                !reveal && "bg-theme text-on-theme",
                result === "found" && "bg-success text-white",
                result === "miss" && "bg-danger text-white",
                (result === "repeat" || ignored) && "bg-fg/60 text-canvas",
              )}
              style={{ left: `${click.x}%`, top: `${click.y}%` }}
            >
              {i + 1}
            </button>
          );
        })}

        {cursor && !locked && (
          <Crosshair
            aria-hidden
            className="pointer-events-none absolute size-9 -translate-x-1/2 -translate-y-1/2 text-theme drop-shadow"
            style={{ left: `${cursor.x}%`, top: `${cursor.y}%` }}
            strokeWidth={2.5}
          />
        )}
      </div>

      {!locked && clicks.length > 0 && (
        <button
          type="button"
          onClick={() => onAnswer({ clicks: [] })}
          className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-fg-muted hover:text-fg"
        >
          <RotateCcw className="size-4" /> Ulangi
        </button>
      )}

      {reveal && judged && (
        <p className="text-sm text-fg-muted">
          Ditemukan {judged.filter((r) => r.result === "found").length} dari {reveal.spots.length}{" "}
          bagian, meleset {judged.filter((r) => r.result === "miss").length} kali. Lingkaran hijau =
          jawaban benar.
        </p>
      )}
    </div>
  );
}
