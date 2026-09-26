"use client";

import type { ReactNode } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { QUESTION_TYPES, questionDefinitions, type QuestionType } from "@/questions/registry";
import { questionUI } from "@/questions/ui";

export function AddQuestionMenu({
  children,
  onAdd,
  align = "start",
}: {
  children: ReactNode;
  onAdd: (type: QuestionType) => void;
  align?: "start" | "center" | "end";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align}>
        <DropdownMenuLabel>Tipe soal</DropdownMenuLabel>
        {QUESTION_TYPES.map((type) => {
          const { Icon } = questionUI[type];
          const definition = questionDefinitions[type];
          return (
            <DropdownMenuItem key={type} onSelect={() => onAdd(type)}>
              <Icon />
              <span className="flex flex-col">
                <span className="font-medium">{definition.label}</span>
                <span className="text-xs text-fg-subtle">{definition.description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
