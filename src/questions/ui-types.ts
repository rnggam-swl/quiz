import type { ComponentType } from "react";

export type EditorProps<Config> = {
  config: Config;
  onChange: (next: Config) => void;
  /** Config paths with publish issues (e.g. "options.2.text"), to highlight fields. */
  invalidPaths?: ReadonlySet<string>;
};

export type PlayerProps<Public, Answer, Config> = {
  /** Participant-safe data from `stripAnswers` — never the answer key. */
  data: Public;
  answer: Answer | null;
  onAnswer: (answer: Answer) => void;
  /**
   * The player considers the answer final (e.g. tapping a single-choice option),
   * so the shell may submit without waiting for the "Kirim" button.
   */
  onCommit?: (answer: Answer) => void;
  disabled?: boolean;
  /** Full config, sent by the server only after answering, to show right/wrong. */
  reveal?: Config;
};

export type QuestionUI<Config, Answer, Public> = {
  Icon: ComponentType<{ className?: string }>;
  Editor: ComponentType<EditorProps<Config>>;
  Player: ComponentType<PlayerProps<Public, Answer, Config>>;
  /** True when a single tap answers (the player calls onCommit), so the shell hides "Kirim". */
  answersOnTap?: (data: Public) => boolean;
};
