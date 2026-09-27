"use client";

import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { typesForMode, unsupportedModes } from "@/questions/modes";
import { QUESTION_TYPES, questionDefinitions, type QuestionType } from "@/questions/registry";
import type { SessionMode } from "@/questions/types";
import { questionUI } from "@/questions/ui";

export function AddQuestionMenu({
  children,
  onAdd,
  align = "start",
  mode,
}: {
  children: ReactNode;
  onAdd: (type: QuestionType) => void;
  align?: "start" | "center" | "end";
  /** Only offer types that work in this mode (for quizzes made for one mode). */
  mode?: SessionMode;
}) {
  const types = mode ? typesForMode(mode) : QUESTION_TYPES;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>Tipe soal</DropdownMenuLabel>
        {types.map((type) => {
          const { Icon } = questionUI[type];
          const definition = questionDefinitions[type];
          const notFor = unsupportedModes(type);
          return (
            <DropdownMenuItem key={type} onSelect={() => onAdd(type)}>
              <Icon />
              <span className="flex flex-col">
                <span className="font-medium">{definition.label}</span>
                <span className="text-xs text-fg-subtle">{definition.description}</span>
                {!mode && notFor.length > 0 && (
                  <span className="text-xs text-fg-muted">Tidak untuk: {notFor.join(", ")}</span>
                )}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
