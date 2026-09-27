import { z } from "zod";

import { scoreResult } from "../shared";
import { normalizeAnswer } from "../short-answer/definition";
import type { Issue, QuestionDefinition } from "../types";

export const MAX_WORD_BLANK_TEXT = 200;
export const WORD_BLANK_UNITS = ["letter", "word"] as const;
export type WordBlankUnit = (typeof WORD_BLANK_UNITS)[number];

const configSchema = z.object({
  /** The full answer, e.g. "Fotosintesis" or "Ibu kota Jepang adalah Tokyo". */
  text: z.string().max(MAX_WORD_BLANK_TEXT),
  /** Blank single letters or whole words. */
  unit: z.enum(WORD_BLANK_UNITS),
  /** Token indexes (see `wordBlankTokens`) hidden from the participant. */
  blanks: z.array(z.number().int().min(0).max(MAX_WORD_BLANK_TEXT)).max(MAX_WORD_BLANK_TEXT),
  hint: z.string().max(200).optional(),
  caseSensitive: z.boolean(),
});
export type WordBlankConfig = z.infer<typeof configSchema>;

const answerSchema = z.object({
  /** Token index (as a string key) → what the participant typed. */
  values: z
    .record(z.string().regex(/^\d{1,3}$/), z.string().max(60))
    .refine((v) => Object.keys(v).length <= MAX_WORD_BLANK_TEXT, "Terlalu banyak isian."),
});
export type WordBlankAnswer = z.infer<typeof answerSchema>;

/** A shown token, or a blank that only reveals how long it is. */
export type WordBlankToken = { kind: "text"; text: string } | { kind: "blank"; length: number };
export type WordBlankPublic = { unit: WordBlankUnit; tokens: WordBlankToken[]; hint?: string };

/** Letters (spaces included, shown as gaps) or whitespace-separated words, like the prototype. */
export function wordBlankTokens(text: string, unit: WordBlankUnit): string[] {
  return unit === "word" ? text.trim().split(/\s+/).filter(Boolean) : Array.from(text);
}

/** The blank indexes that point at a real, non-space token — in token order, without repeats. */
export function activeBlanks(config: Pick<WordBlankConfig, "text" | "unit" | "blanks">): number[] {
  const tokens = wordBlankTokens(config.text, config.unit);
  return [...new Set(config.blanks)]
    .filter((i) => i < tokens.length && tokens[i]!.trim() !== "")
    .sort((a, b) => a - b);
}

export const wordBlank: QuestionDefinition<WordBlankConfig, WordBlankAnswer, WordBlankPublic> = {
  type: "word_blank",
  label: "Tebak yang Hilang",
  description: "Lengkapi huruf atau kata yang disembunyikan.",
  configSchema,
  answerSchema,
  capabilities: {
    modes: { practice: "ok", exam: "ok", live: "ok", battle_royale: "ok" },
    notes: { battle_buzzer: "Kecepatan mengetik ikut menentukan hasil rebutan." },
    avgSeconds: 25,
    partialCredit: true,
  },

  defaults() {
    return { text: "", unit: "letter", blanks: [], caseSensitive: false };
  },

  validate(config) {
    const issues: Issue[] = [];
    if (!config.text.trim()) {
      issues.push({ path: "text", message: "Jawaban lengkapnya belum diisi." });
      return issues;
    }
    if (activeBlanks(config).length === 0) {
      issues.push({
        path: "blanks",
        message: `Pilih minimal satu ${config.unit === "word" ? "kata" : "huruf"} yang disembunyikan.`,
      });
    }
    return issues;
  },

  score(config, answer) {
    const tokens = wordBlankTokens(config.text, config.unit);
    const blanks = activeBlanks(config);
    const correct = blanks.filter((i) => {
      const given = Object.hasOwn(answer.values, String(i)) ? answer.values[String(i)]! : "";
      return (
        given.trim() !== "" &&
        normalizeAnswer(given, config.caseSensitive) ===
          normalizeAnswer(tokens[i]!, config.caseSensitive)
      );
    }).length;
    return scoreResult(correct, blanks.length);
  },

  stripAnswers(config) {
    const blanks = new Set(activeBlanks(config));
    const tokens = wordBlankTokens(config.text, config.unit).map((text, i): WordBlankToken =>
      // The hidden token never leaves the server — only its length (1 for letters).
      blanks.has(i) ? { kind: "blank", length: Array.from(text).length } : { kind: "text", text },
    );
    return { unit: config.unit, tokens, ...(config.hint?.trim() && { hint: config.hint.trim() }) };
  },

  isAnswered(answer) {
    return Object.values(answer?.values ?? {}).some((v) => v.trim() !== "");
  },
};
