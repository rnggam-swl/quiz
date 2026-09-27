import { describe, expect, it } from "vitest";

import { activeBlanks, wordBlank, wordBlankTokens, type WordBlankConfig } from "./definition";

// "Foto sintesis": blanks on "o" (1), "s" (5) and "t" (8).
const letters: WordBlankConfig = {
  text: "Foto sintesis",
  unit: "letter",
  blanks: [1, 5, 8],
  caseSensitive: false,
};
const words: WordBlankConfig = {
  text: "Ibu kota Jepang adalah Tokyo",
  unit: "word",
  blanks: [2, 4],
  hint: "Negeri Sakura",
  caseSensitive: false,
};

describe("wordBlankTokens", () => {
  it("splits into letters (spaces kept) or words", () => {
    expect(wordBlankTokens("Ab c", "letter")).toEqual(["A", "b", " ", "c"]);
    expect(wordBlankTokens("  Ibu   kota ", "word")).toEqual(["Ibu", "kota"]);
  });

  it("keeps emoji and accented letters as one token", () => {
    expect(wordBlankTokens("café👍", "letter")).toHaveLength(5);
  });
});

describe("wordBlank.score", () => {
  it("counts each correctly filled blank, ignoring case by default", () => {
    expect(wordBlank.score(letters, { values: { "1": "O", "5": "s", "8": "t" } })).toEqual({
      correct: 3,
      total: 3,
      ratio: 1,
    });
    expect(wordBlank.score(letters, { values: { "1": "o", "5": "x" } }).correct).toBe(1);
    expect(wordBlank.score(words, { values: { "2": " jepang ", "4": "Kyoto" } }).correct).toBe(1);
  });

  it("respects case sensitivity", () => {
    const strict = { ...words, caseSensitive: true };
    expect(wordBlank.score(strict, { values: { "2": "jepang", "4": "Tokyo" } }).correct).toBe(1);
  });

  it("ignores values for tokens that are not blanks, and blanks on spaces", () => {
    expect(wordBlank.score(letters, { values: { "0": "F", "2": "t" } }).correct).toBe(0);
    const spaceBlank = { ...letters, blanks: [4, 1] };
    expect(activeBlanks(spaceBlank)).toEqual([1]);
    expect(wordBlank.score(spaceBlank, { values: { "4": " ", "1": "o" } })).toEqual({
      correct: 1,
      total: 1,
      ratio: 1,
    });
  });

  it("gives nothing for empty answers", () => {
    expect(wordBlank.score(letters, { values: {} }).ratio).toBe(0);
  });
});

describe("wordBlank.validate", () => {
  it("needs the text and at least one blank", () => {
    expect(wordBlank.validate(letters)).toEqual([]);
    expect(wordBlank.validate(wordBlank.defaults()).map((i) => i.path)).toEqual(["text"]);
    expect(wordBlank.validate({ ...letters, blanks: [4, 99] }).map((i) => i.path)).toEqual([
      "blanks",
    ]);
  });
});

describe("wordBlank.stripAnswers", () => {
  it("sends visible tokens and blank lengths, never the hidden text", () => {
    const pub = wordBlank.stripAnswers(words, { seed: 1, shuffle: true });
    expect(pub.tokens).toEqual([
      { kind: "text", text: "Ibu" },
      { kind: "text", text: "kota" },
      { kind: "blank", length: 6 },
      { kind: "text", text: "adalah" },
      { kind: "blank", length: 5 },
    ]);
    expect(pub.hint).toBe("Negeri Sakura");
    expect(JSON.stringify(pub)).not.toMatch(/Jepang|Tokyo/);
  });
});
