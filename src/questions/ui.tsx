import {
  ArrowLeftRight,
  Boxes,
  GitBranch,
  Hash,
  ListChecks,
  ListOrdered,
  MousePointerClick,
  Shapes,
  SlidersHorizontal,
  TextCursorInput,
  ToggleLeft,
  WholeWord,
} from "lucide-react";

import { BranchingEditor } from "./branching/Editor";
import { BranchingPlayer } from "./branching/Player";
import { GroupingEditor } from "./grouping/Editor";
import { GroupingPlayer } from "./grouping/Player";
import { HotspotEditor } from "./hotspot/Editor";
import { HotspotPlayer } from "./hotspot/Player";
import { MatchingEditor } from "./matching/Editor";
import { MatchingPlayer } from "./matching/Player";
import { MultipleChoiceEditor } from "./multiple-choice/Editor";
import { MultipleChoicePlayer } from "./multiple-choice/Player";
import { NumberEditor } from "./number/Editor";
import { NumberPlayer } from "./number/Player";
import { OddOneOutEditor } from "./odd-one-out/Editor";
import { OddOneOutPlayer } from "./odd-one-out/Player";
import type { questionDefinitions, QuestionType } from "./registry";
import { SequencingEditor } from "./sequencing/Editor";
import { SequencingPlayer } from "./sequencing/Player";
import { ShortAnswerEditor } from "./short-answer/Editor";
import { ShortAnswerPlayer } from "./short-answer/Player";
import { SliderEditor } from "./slider/Editor";
import { SliderPlayer } from "./slider/Player";
import { TrueFalseEditor } from "./true-false/Editor";
import { TrueFalsePlayer } from "./true-false/Player";
import type { AnswerOf, ConfigOf, PublicOf } from "./types";
import type { QuestionUI } from "./ui-types";
import { WordBlankEditor } from "./word-blank/Editor";
import { WordBlankPlayer } from "./word-blank/Player";

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
  slider: { Icon: SlidersHorizontal, Editor: SliderEditor, Player: SliderPlayer },
  odd_one_out: {
    Icon: Shapes,
    Editor: OddOneOutEditor,
    Player: OddOneOutPlayer,
    answersOnTap: () => true,
  },
  matching: { Icon: ArrowLeftRight, Editor: MatchingEditor, Player: MatchingPlayer },
  sequencing: { Icon: ListOrdered, Editor: SequencingEditor, Player: SequencingPlayer },
  grouping: { Icon: Boxes, Editor: GroupingEditor, Player: GroupingPlayer },
  word_blank: { Icon: WholeWord, Editor: WordBlankEditor, Player: WordBlankPlayer },
  hotspot: { Icon: MousePointerClick, Editor: HotspotEditor, Player: HotspotPlayer },
  branching: { Icon: GitBranch, Editor: BranchingEditor, Player: BranchingPlayer },
};
