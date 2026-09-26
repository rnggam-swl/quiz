"use client";

import type { ComponentType, ReactNode } from "react";

import type { QuestionType } from "@/questions/registry";
import type { MediaRef } from "@/questions/shared";
import { questionUI } from "@/questions/ui";
import type { PlayerProps } from "@/questions/ui-types";

type QuestionViewProps = {
  type: QuestionType;
  prompt: string;
  help?: string;
  media?: MediaRef[];
  data: unknown;
  answer: unknown;
  onAnswer?: (answer: unknown) => void;
  onCommit?: (answer: unknown) => void;
  disabled?: boolean;
  reveal?: unknown;
  /** Heading level-ish size: the live question is big, review items are compact. */
  size?: "lg" | "sm";
  children?: ReactNode;
};

/** Prompt + media + the type's Player. Shared by the practice player, its review list and the preview. */
export function QuestionView({
  type,
  prompt,
  help,
  media = [],
  data,
  answer,
  onAnswer = () => {},
  onCommit,
  disabled,
  reveal,
  size = "lg",
  children,
}: QuestionViewProps) {
  const Player = questionUI[type].Player as ComponentType<PlayerProps<unknown, unknown, unknown>>;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h2
          className={
            size === "lg"
              ? "text-2xl leading-snug font-semibold text-balance sm:text-3xl"
              : "text-base font-semibold"
          }
        >
          {prompt || <span className="text-fg-subtle italic">Soal tanpa pertanyaan</span>}
        </h2>
        {help && <p className="text-fg-muted">{help}</p>}
      </div>

      {media.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {media.map((m) =>
            m.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element -- user upload from Storage
              <img
                key={m.url}
                src={m.url}
                alt={m.alt ?? ""}
                className={
                  size === "lg"
                    ? "max-h-72 rounded-2xl object-contain shadow-card"
                    : "max-h-32 rounded-xl object-contain"
                }
              />
            ) : (
              <audio key={m.url} controls src={m.url} className="w-full max-w-md" />
            ),
          )}
        </div>
      )}

      <Player
        data={data}
        answer={answer}
        onAnswer={onAnswer}
        onCommit={onCommit}
        disabled={disabled}
        reveal={reveal}
      />
      {children}
    </div>
  );
}

/** Whether a single tap answers this question (so no "Kirim" button is needed). */
export function answersOnTap(type: QuestionType, data: unknown): boolean {
  const check = questionUI[type].answersOnTap as ((data: unknown) => boolean) | undefined;
  return check?.(data) ?? false;
}
