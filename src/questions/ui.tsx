import { ArrowLeftRight, Hash, ListChecks, TextCursorInput, ToggleLeft } from "lucide-react";

import { MatchingEditor } from "./matching/Editor";
import { MatchingPlayer } from "./matching/Player";
import { MultipleChoiceEditor } from "./multiple-choice/Editor";
import { MultipleChoicePlayer } from "./multiple-choice/Player";
import { NumberEditor } from "./number/Editor";
import { NumberPlayer } from "./number/Player";
import type { questionDefinitions, QuestionType } from "./registry";
import { ShortAnswerEditor } from "./short-answer/Editor";
import { ShortAnswerPlayer } from "./short-answer/Player";
import { TrueFalseEditor } from "./true-false/Editor";
import { TrueFalsePlayer } from "./true-false/Player";
import type { AnswerOf, ConfigOf, PublicOf } from "./types";
import type { QuestionUI } from "./ui-types";

type UIRegistry = {
  [T in QuestionType]: QuestionUI<
    ConfigOf<(typeof questionDefinitions)[T]>,
    AnswerOf<(typeof questionDefinitions)[T]>,
    PublicOf<(typeof questionDefinitions)[T]>
  >;
};

/** Client half of the registry: editor + player per type (see registry.ts for the logic). */
export const questionUI: UIRegistry = {
  multiple_choice: {
    Icon: ListChecks,
    Editor: MultipleChoiceEditor,
    Player: MultipleChoicePlayer,
    answersOnTap: (data) => !data.multiple,
  },
  true_false: {
    Icon: ToggleLeft,
    Editor: TrueFalseEditor,
    Player: TrueFalsePlayer,
    answersOnTap: () => true,
  },
  short_answer: { Icon: TextCursorInput, Editor: ShortAnswerEditor, Player: ShortAnswerPlayer },
  number: { Icon: Hash, Editor: NumberEditor, Player: NumberPlayer },
  matching: { Icon: ArrowLeftRight, Editor: MatchingEditor, Player: MatchingPlayer },
};
