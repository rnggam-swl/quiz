import { branching } from "./branching/definition";
import { grouping } from "./grouping/definition";
import { hotspot } from "./hotspot/definition";
import { matching } from "./matching/definition";
import { multipleChoice } from "./multiple-choice/definition";
import { numberQuestion } from "./number/definition";
import { oddOneOut } from "./odd-one-out/definition";
import { sequencing } from "./sequencing/definition";
import { shortAnswer } from "./short-answer/definition";
import { slider } from "./slider/definition";
import { trueFalse } from "./true-false/definition";
import { wordBlank } from "./word-blank/definition";
import type { AnyQuestionDefinition } from "./types";

/**
 * Every question type, keyed by `questions.type`. Adding a type = one folder +
 * one line here (+ its UI in ui.tsx). Order = order in the "add question" menu.
 */
export const questionDefinitions = {
  multiple_choice: multipleChoice,
  true_false: trueFalse,
  short_answer: shortAnswer,
  number: numberQuestion,
  slider,
  odd_one_out: oddOneOut,
  matching,
  sequencing,
  grouping,
  word_blank: wordBlank,
  hotspot,
  branching,
} as const satisfies Record<string, AnyQuestionDefinition>;

export type QuestionType = keyof typeof questionDefinitions;

export const QUESTION_TYPES = Object.keys(questionDefinitions) as [QuestionType, ...QuestionType[]];

export function isQuestionType(value: string): value is QuestionType {
  return Object.hasOwn(questionDefinitions, value);
}

export function getDefinition(type: QuestionType): AnyQuestionDefinition {
  return questionDefinitions[type];
}
