import { matching } from "./matching/definition";
import { multipleChoice } from "./multiple-choice/definition";
import { numberQuestion } from "./number/definition";
import { shortAnswer } from "./short-answer/definition";
import { trueFalse } from "./true-false/definition";
import type { AnyQuestionDefinition } from "./types";

/**
 * Every question type, keyed by `questions.type`. Adding a type = one folder +
 * one line here (+ its UI in ui-registry.tsx). Order = order in the "add question" menu.
 */
export const questionDefinitions = {
  multiple_choice: multipleChoice,
  true_false: trueFalse,
  short_answer: shortAnswer,
  number: numberQuestion,
  matching,
} as const satisfies Record<string, AnyQuestionDefinition>;

export type QuestionType = keyof typeof questionDefinitions;

export const QUESTION_TYPES = Object.keys(questionDefinitions) as [QuestionType, ...QuestionType[]];

export function isQuestionType(value: string): value is QuestionType {
  return Object.hasOwn(questionDefinitions, value);
}

export function getDefinition(type: QuestionType): AnyQuestionDefinition {
  return questionDefinitions[type];
}
