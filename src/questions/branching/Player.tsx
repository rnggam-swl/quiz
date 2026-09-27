"use client";

import { Check, Flag, RotateCcw, Undo2, X } from "lucide-react";
import { useState } from "react";

import type { AnswerSlot } from "@/components/player/AnswerShape";
import { AnswerTile } from "@/components/player/AnswerTile";
import { cn } from "@/lib/cn";

import type { MediaRef } from "../shared";
import type { PlayerProps } from "../ui-types";
import {
  walkStory,
  type BranchingAnswer,
  type BranchingConfig,
  type BranchingPublic,
} from "./definition";

function NodeMedia({ media }: { media: MediaRef }) {
  return media.kind === "image" ? (
    // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
    <img
      src={media.url}
      alt={media.alt ?? ""}
      className="max-h-64 self-start rounded-2xl object-contain shadow-card"
    />
  ) : (
    <audio controls src={media.url} className="w-full max-w-md" />
  );
}

/**
 * Walk the story one node at a time. Reaching an ending records the path as the
 * answer (the shell's "Kirim" then submits it); until then the participant can step
 * back or start over. The server re-walks the path, so a forged path scores nothing.
 */
export function BranchingPlayer({
  data,
  answer,
  onAnswer,
  disabled,
  reveal,
}: PlayerProps<BranchingPublic, BranchingAnswer, BranchingConfig>) {
  const [path, setPath] = useState<string[]>(() => answer?.path ?? []);
  const locked = disabled || !!reveal;
  const walk = walkStory(data, path) ?? walkStory(data, []);

  if (!walk) return <p className="text-sm text-fg-subtle italic">Cerita belum punya node awal.</p>;
  const node = walk.end;

  function go(next: string[]) {
    setPath(next);
    const reached = walkStory(data, next);
    // Only a path that ends the story is an answer; anything shorter clears it.
    onAnswer({ path: reached?.end.ending ? next : [] });
  }

  const fullNode = reveal?.nodes.find((n) => n.id === node.id);
  const correctOf = (choiceId: string) =>
    reveal?.nodes.flatMap((n) => n.choices).find((c) => c.id === choiceId)?.correct;

  return (
    <div className="flex flex-col gap-4">
      {!reveal && (
        <div className="flex items-center justify-between text-sm font-medium text-fg-muted">
          <span>{node.ending ? "Akhir cerita" : `Langkah ${path.length + 1}`}</span>
          {!locked && path.length > 0 && (
            <span className="flex gap-3">
              <button
                type="button"
                onClick={() => go(path.slice(0, -1))}
                className="inline-flex items-center gap-1 hover:text-fg"
              >
                <Undo2 className="size-4" /> Mundur
              </button>
              <button
                type="button"
                onClick={() => go([])}
                className="inline-flex items-center gap-1 hover:text-fg"
              >
                <RotateCcw className="size-4" /> Dari awal
              </button>
            </span>
          )}
        </div>
      )}

      {reveal && walk.taken.length > 0 && (
        <ol
          className="flex flex-col gap-1.5 rounded-xl bg-surface-muted p-3 text-sm"
          aria-label="Jejak pilihanmu"
        >
          {walk.taken.map((choice, i) => {
            const correct = reveal.scoring === "choices" ? correctOf(choice.id) : undefined;
            return (
              <li key={`${choice.id}-${i}`} className="flex items-center gap-2">
                <span className="text-fg-subtle tabular-nums">{i + 1}.</span>
                <span className="min-w-0 flex-1">{choice.text}</span>
                {correct === true && (
                  <Check
                    aria-label="pilihan tepat"
                    className="size-4 text-success"
                    strokeWidth={3}
                  />
                )}
                {correct === false && (
                  <X
                    aria-label="pilihan kurang tepat"
                    className="size-4 text-danger"
                    strokeWidth={3}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}

      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl p-5 shadow-card",
          node.ending ? "bg-theme text-on-theme" : "bg-surface",
        )}
        aria-live="polite"
      >
        {node.ending && (
          <span className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide uppercase">
            <Flag className="size-4" /> {node.ending.label.trim() || "Tamat"}
          </span>
        )}
        {node.media && <NodeMedia media={node.media} />}
        <p className="text-lg leading-relaxed whitespace-pre-line">{node.text}</p>
        {reveal && fullNode?.ending && reveal.scoring === "ending" && (
          <p className="text-sm font-semibold">
            Akhir ini bernilai {Math.round(fullNode.ending.score * 100)}%.
          </p>
        )}
      </div>

      {!node.ending && (
        <div className="grid gap-3 sm:grid-cols-2" role="group" aria-label="Pilihan">
          {node.choices.map((choice, index) => (
            <AnswerTile
              key={choice.id}
              slot={((index % 5) + 1) as AnswerSlot}
              disabled={locked}
              onClick={() => go([...path, choice.id])}
            >
              {choice.text || `Pilihan ${index + 1}`}
            </AnswerTile>
          ))}
          {node.choices.length === 0 && (
            <p className="text-sm text-fg-subtle italic">Cerita berhenti di sini.</p>
          )}
        </div>
      )}
    </div>
  );
}
