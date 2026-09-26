import { describe, expect, it } from "vitest";

import { editDistance, normalizeAnswer, shortAnswer, type ShortAnswerConfig } from "./definition";

const config: ShortAnswerConfig = {
  accepted: ["Soekarno", "Sukarno"],
  caseSensitive: false,
  fuzzy: 0,
};
const score = (c: ShortAnswerConfig, text: string) => shortAnswer.score(c, { text }).ratio;

describe("normalizeAnswer", () => {
  it("trims, collapses whitespace and lowercases", () => {
    expect(normalizeAnswer("  Ir.   Soekarno \n", false)).toBe("ir. soekarno");
  });

  it("keeps case when case-sensitive", () => {
    expect(normalizeAnswer(" H2O ", true)).toBe("H2O");
  });

  it("normalizes full-width characters (NFKC)", () => {
    expect(normalizeAnswer("ＡＢＣ", false)).toBe("abc");
  });
});

describe("editDistance", () => {
  it("computes Levenshtein distance", () => {
    expect(editDistance("kitten", "sitting", 5)).toBe(3);
    expect(editDistance("abc", "abc", 2)).toBe(0);
  });

  it("stops early once past the limit", () => {
    expect(editDistance("abcdef", "uvwxyz", 1)).toBe(2);
    expect(editDistance("a", "abcdef", 2)).toBe(3);
  });
});

describe("short_answer.score", () => {
  it("accepts any accepted spelling, ignoring case and spacing", () => {
    expect(score(config, "soekarno")).toBe(1);
    expect(score(config, "  SUKARNO ")).toBe(1);
  });

  it("rejects other and empty answers", () => {
    expect(score(config, "Hatta")).toBe(0);
    expect(score(config, "   ")).toBe(0);
  });

  it("respects case sensitivity", () => {
    const strict = { ...config, accepted: ["H2O"], caseSensitive: true };
    expect(score(strict, "H2O")).toBe(1);
    expect(score(strict, "h2o")).toBe(0);
  });

  it("tolerates typos up to `fuzzy` for longer answers only", () => {
    const fuzzy = { ...config, fuzzy: 1 as const };
    expect(score(fuzzy, "Soekrno")).toBe(1);
    expect(score(fuzzy, "Sokrno")).toBe(0);
    const short = { ...config, accepted: ["cat"], fuzzy: 2 as const };
    expect(score(short, "car")).toBe(0);
  });

  it("ignores blank accepted entries", () => {
    expect(score({ ...config, accepted: ["", "Hatta"] }, "")).toBe(0);
  });
});

describe("short_answer.validate", () => {
  it("requires at least one accepted answer", () => {
    expect(shortAnswer.validate(shortAnswer.defaults()).map((i) => i.path)).toEqual(["accepted"]);
    expect(shortAnswer.validate(config)).toEqual([]);
  });

  it("flags blank rows when there are several", () => {
    expect(shortAnswer.validate({ ...config, accepted: ["Soekarno", " "] })).toEqual([
      { path: "accepted.1", message: "Jawaban diterima #2 masih kosong." },
    ]);
  });
});
