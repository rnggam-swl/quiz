"use client";

import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";

import { Avatar } from "@/components/live/Avatar";
import { Button } from "@/components/ui/Button";
import type { ReplayFrame } from "@/engine/live/report";
import { cn } from "@/lib/cn";

const ROW_REM = 3.5;

/** Step through the leaderboard after each question (P5-18). */
export function LeaderboardReplay({ frames }: { frames: (ReplayFrame & { prompt: string })[] }) {
  const [index, setIndex] = useState(frames.length - 1);
  const [playing, setPlaying] = useState(false);
  const frame = frames[Math.min(index, frames.length - 1)]!;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => {
      if (index >= frames.length - 1) setPlaying(false);
      else setIndex(index + 1);
    }, 1800);
    return () => clearTimeout(timer);
  }, [playing, index, frames.length]);

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Soal sebelumnya"
          disabled={index === 0}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft />
        </Button>
        <span className="text-sm font-medium tabular-nums">
          Setelah soal {frame.round + 1} dari {frames.length}
        </span>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Soal berikutnya"
          disabled={index >= frames.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            if (!playing && index >= frames.length - 1) setIndex(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause /> : <Play />} {playing ? "Jeda" : "Putar dari awal"}
        </Button>
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={index}
          onChange={(e) => setIndex(Number(e.target.value))}
          aria-label="Pilih soal"
          className="ml-auto w-40 accent-accent"
        />
      </div>
      <p className="line-clamp-1 text-sm text-fg-muted">{frame.prompt || "(tanpa teks)"}</p>
      <ol key={frame.round} className="flex flex-col gap-2">
        {frame.top.map((row, i) => (
          <li
            key={row.id}
            style={
              {
                "--rank-from": `${(Math.min(row.prevRank - 1, 6) - i) * ROW_REM}rem`,
              } as CSSProperties
            }
            className={cn(
              "flex h-12 animate-rank-move items-center gap-3 rounded-xl bg-surface-muted px-3",
              row.rank === 1 && "ring-2 ring-warning",
            )}
          >
            <span className="w-6 font-bold tabular-nums">{row.rank}</span>
            <Avatar id={row.id} className="size-8 text-base" />
            <span className="min-w-0 flex-1 truncate font-medium">{row.nickname}</span>
            {row.delta > 0 && (
              <span className="text-sm font-semibold text-success tabular-nums">+{row.delta}</span>
            )}
            <span className="w-20 text-right font-bold tabular-nums">{row.score}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
