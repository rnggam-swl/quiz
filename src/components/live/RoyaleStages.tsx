"use client";

import { Crown, Eye, Heart, Skull } from "lucide-react";

import type { HostView, RosterEntry } from "@/engine/live/types";
import { cn } from "@/lib/cn";

import { Avatar } from "./Avatar";

// Battle royale on the projector (docs/10 · UX, P7-09 – P7-11).

/** ❤️❤️🤍: lives left out of the starting number. */
export function Hearts({
  lives,
  max,
  className,
}: {
  lives: number;
  max: number;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-0.5", className)}
      role="img"
      aria-label={`${lives} dari ${max} nyawa`}
    >
      {Array.from({ length: max }, (_, i) => (
        <Heart
          key={i}
          aria-hidden
          className={cn(
            "size-[1em] transition-colors",
            i < lives ? "fill-danger text-danger" : "text-line-strong",
          )}
        />
      ))}
    </span>
  );
}

/** "12 / 40 tersisa", plus the zone and sudden-death labels. */
export function RoyaleCounter({ view, large }: { view: HostView; large?: boolean }) {
  const royale = view.royale;
  if (!royale) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-3" aria-live="polite">
      <span
        className={cn(
          "rounded-2xl bg-surface px-5 py-2 font-bold tabular-nums shadow-card",
          large ? "text-5xl" : "text-2xl",
        )}
      >
        {royale.remaining} / {royale.total}{" "}
        <span className={cn("font-medium text-fg-muted", large ? "text-3xl" : "text-lg")}>
          tersisa
        </span>
      </span>
      {royale.suddenDeath ? (
        <span className="animate-pop rounded-full bg-danger px-4 py-1.5 text-lg font-bold text-on-accent">
          Sudden death!
        </span>
      ) : (
        royale.shrinking &&
        view.phase !== "leaderboard" && (
          <span className="animate-pop rounded-full bg-danger-soft px-4 py-1.5 text-lg font-semibold text-danger">
            Zona menyempit!
          </span>
        )
      )}
    </div>
  );
}

/** Everyone who played: survivors in colour with their hearts, the eliminated greyed out. */
export function RoyaleGrid({ view }: { view: HostView }) {
  const max = view.royale?.startLives ?? 3;
  const justOut = new Set(view.royale?.eliminated.map((e) => e.id) ?? []);
  const sorted = [...view.roster].sort(
    (a, b) => Number(a.eliminatedRound !== null) - Number(b.eliminatedRound !== null),
  );
  return (
    <ul className="flex flex-wrap content-start justify-center gap-2" aria-label="Peserta">
      {sorted.map((p: RosterEntry) => {
        const out = p.eliminatedRound !== null && p.eliminatedRound !== undefined;
        return (
          <li
            key={p.id}
            className={cn(
              "flex items-center gap-2 rounded-full bg-surface py-1 pr-3 pl-1 shadow-card transition-all duration-700",
              out && "opacity-40 grayscale",
              justOut.has(p.id) && "animate-shake",
            )}
          >
            <Avatar id={p.id} className="size-8 text-base" />
            <span className={cn("max-w-32 truncate font-semibold", out && "line-through")}>
              {p.nickname}
            </span>
            {out ? (
              <Skull className="size-4 text-fg-muted" aria-label="tersingkir" />
            ) : (
              <Hearts lives={p.lives ?? max} max={max} className="text-sm" />
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Who went out this round. */
export function Eliminated({ view }: { view: HostView }) {
  const out = view.royale?.eliminated ?? [];
  if (out.length === 0) {
    return (
      <p className="text-center text-2xl font-semibold text-success">
        Tidak ada yang tersingkir di putaran ini
      </p>
    );
  }
  return (
    <p className="animate-pop text-center text-2xl font-semibold text-danger">
      Tersingkir: {out.map((e) => e.nickname).join(", ")}
    </p>
  );
}

/** Between rounds: the counter and the grid instead of a points table. */
export function RoyaleBoard({ view }: { view: HostView }) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6">
      <RoyaleCounter view={view} large />
      <RoyaleGrid view={view} />
    </div>
  );
}

/** The last one standing, how long the others lasted, and the best spectators (P7-11). */
export function RoyalePodium({ view }: { view: HostView }) {
  const [winner, ...rest] = view.top;
  const rounds = (r: number | null | undefined) =>
    r === null || r === undefined ? "sampai akhir" : `sampai putaran ke-${r + 1}`;
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 text-center">
      {winner && (
        <div className="flex animate-podium flex-col items-center gap-3">
          <Crown className="size-14 text-warning" aria-hidden />
          <Avatar id={winner.id} className="size-24 text-5xl" />
          <p className="text-4xl font-bold">{winner.nickname}</p>
          <p className="text-xl text-fg-muted">Bertahan {rounds(winner.eliminatedRound)}</p>
        </div>
      )}
      {rest.length > 0 && (
        <ol className="flex flex-wrap justify-center gap-3">
          {rest.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 rounded-2xl bg-surface px-4 py-2 shadow-card"
            >
              <span className="font-bold tabular-nums">#{row.rank}</span>
              <Avatar id={row.id} className="size-8 text-base" />
              <span className="font-semibold">{row.nickname}</span>
              <span className="text-sm text-fg-muted">{rounds(row.eliminatedRound)}</span>
            </li>
          ))}
        </ol>
      )}
      {!!view.royale?.spectators.length && (
        <section className="flex flex-col items-center gap-2" aria-label="Penonton terbaik">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-fg-muted">
            <Eye className="size-5" aria-hidden /> Penonton terbaik (poin bayangan)
          </h3>
          <ol className="flex flex-wrap justify-center gap-3">
            {view.royale.spectators.map((sp) => (
              <li
                key={sp.id}
                className="flex items-center gap-2 rounded-full bg-surface-muted px-4 py-1.5"
              >
                <Avatar id={sp.id} className="size-7 text-sm" />
                <span className="font-medium">{sp.nickname}</span>
                <span className="text-sm text-fg-muted tabular-nums">{sp.score}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
