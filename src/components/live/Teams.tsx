"use client";

import { Shuffle, Trophy } from "lucide-react";
import type { ReactNode } from "react";

import { AnswerShape, answerSlotClasses } from "@/components/player/AnswerShape";
import { Button } from "@/components/ui/Button";
import type { GameMode, TeamRef, TeamStanding } from "@/engine/live/types";
import { cn } from "@/lib/cn";

// Mode tim (P8-02, docs/10-mode-battle.md#mode-tim): every team has an answer slot's colour
// AND shape, so colour is never the only cue.

export function TeamChip({ team, className }: { team: TeamRef; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full py-0.5 pr-3 pl-1 font-semibold",
        answerSlotClasses(team.slot),
        className,
      )}
    >
      <AnswerShape slot={team.slot} className="size-[1.4em] rounded-full bg-transparent p-0.5" />
      {team.name}
    </span>
  );
}

const unit = (mode: GameMode) =>
  mode === "live" ? "rata-rata" : mode === "battle_royale" ? "nyawa" : "poin";

/** The projector's team board (leaderboard, podium). */
export function TeamBoard({ teams, mode }: { teams: TeamStanding[]; mode: GameMode }) {
  const top = Math.max(1, ...teams.map((t) => t.score));
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-3" aria-label="Papan skor tim">
      {teams.map((team) => (
        <div key={team.id} className="flex items-center gap-4">
          <span className="w-10 text-right text-2xl font-bold tabular-nums">#{team.rank}</span>
          <div className="relative h-14 flex-1 overflow-hidden rounded-2xl bg-surface shadow-card">
            <div
              className={cn(
                "absolute inset-y-0 left-0 opacity-35 transition-[width] duration-700",
                answerSlotClasses(team.slot),
              )}
              style={{ width: `${Math.max(12, (team.score / top) * 100)}%` }}
              aria-hidden
            />
            <div className="relative flex h-full items-center justify-between gap-3 px-3">
              <TeamChip team={team} className="text-xl" />
              <span className="rounded-full bg-surface/90 px-3 py-0.5 text-xl font-bold text-fg tabular-nums">
                {team.score} <span className="text-sm font-normal text-fg-muted">{unit(mode)}</span>
              </span>
            </div>
          </div>
          <span className="w-28 text-sm text-fg-muted">
            {mode === "battle_royale"
              ? `${team.alive}/${team.members} bertahan`
              : `${team.members} anggota`}
          </span>
        </div>
      ))}
    </section>
  );
}

/** Podium banner: the winning team (or teams, on a tie). */
export function TeamWinner({ teams }: { teams: TeamStanding[] }) {
  const winners = teams.filter((t) => t.rank === 1);
  if (winners.length === 0) return null;
  return (
    <p className="flex animate-pop flex-wrap items-center justify-center gap-3 text-3xl font-bold">
      <Trophy className="size-9 text-warning" aria-hidden />
      {winners.map((t) => (
        <TeamChip key={t.id} team={t} className="text-2xl" />
      ))}
      {winners.length > 1 ? "seri di puncak!" : "menang!"}
    </p>
  );
}

/** The lobby on the projector: members by team (and who hasn't got one yet). */
export function TeamRoster({
  teams,
  roster,
  renderMember,
  onShuffle,
}: {
  teams: TeamStanding[];
  roster: { id: string }[];
  renderMember: (id: string) => ReactNode;
  onShuffle?: () => void;
}) {
  const placed = new Set(teams.flatMap((t) => t.memberIds ?? []));
  const waiting = roster.filter((p) => !placed.has(p.id));
  return (
    <div className="flex flex-col gap-4">
      {onShuffle && (
        <Button variant="secondary" className="self-start" onClick={onShuffle}>
          <Shuffle /> Acak ulang tim
        </Button>
      )}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((team) => (
          <section
            key={team.id}
            className="flex flex-col gap-2 rounded-3xl bg-surface p-4 shadow-card"
          >
            <h3 className="flex items-center justify-between gap-2">
              <TeamChip team={team} className="text-lg" />
              <span className="text-sm text-fg-muted tabular-nums">{team.members}</span>
            </h3>
            <ul className="flex flex-wrap gap-2">
              {(team.memberIds ?? []).map((id) => (
                <li key={id}>{renderMember(id)}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {waiting.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold text-fg-muted">Belum memilih tim</h3>
          <ul className="flex flex-wrap gap-2">
            {waiting.map((p) => (
              <li key={p.id}>{renderMember(p.id)}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** A phone in the lobby of a "choose" session: pick a team. */
export function TeamPicker({
  teams,
  current,
  busy,
  onPick,
}: {
  teams: TeamStanding[];
  current: string | null;
  busy: boolean;
  onPick: (teamId: string) => void;
}) {
  return (
    <div className="flex w-full flex-col gap-2" role="group" aria-label="Pilih tim">
      <p className="font-semibold">Pilih timmu</p>
      {teams.map((team) => (
        <button
          key={team.id}
          type="button"
          disabled={busy}
          aria-pressed={current === team.id}
          onClick={() => onPick(team.id)}
          className={cn(
            "flex items-center justify-between rounded-2xl px-4 py-3 text-lg font-semibold transition-transform active:scale-[0.98] disabled:opacity-70",
            answerSlotClasses(team.slot),
            current === team.id && "ring-4 ring-fg/80 ring-offset-2 ring-offset-canvas",
          )}
        >
          <span className="flex items-center gap-2">
            <AnswerShape slot={team.slot} className="size-6 bg-transparent p-0" />
            {team.name}
          </span>
          <span className="text-sm font-normal">{team.members} anggota</span>
        </button>
      ))}
    </div>
  );
}
