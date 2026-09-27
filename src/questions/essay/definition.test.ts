import { describe, expect, it } from "vitest";

import { countWords, essay, rubricRatio, type EssayConfig } from "./definition";

const config: EssayConfig = {
  minWords: 20,
  maxWords: 200,
  rubric: [
    { id: "isi", criterion: "Isi", points: 4 },
    { id: "bahasa", criterion: "Bahasa", points: 2 },
  ],
  guide: "Menyebut klorofil dan cahaya.",
};

describe("countWords", () => {
  it("counts words the way people do", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("  Fotosintesis   butuh cahaya.\n")).toBe(3);
    expect(countWords("anak-anak bermain, 3 kali")).toBe(4);
    expect(countWords("— ... !!")).toBe(0);
  });
});

describe("essay scoring", () => {
  it("is graded by hand: automatic scoring gives no score", () => {
    expect(essay.capabilities.manualGrading).toBe(true);
    expect(essay.score(config, { text: "Jawaban apa pun" })).toEqual({
      correct: 0,
      total: 0,
      ratio: 0,
    });
  });

  it("turns rubric scores into a ratio, clamping each criterion", () => {
    expect(rubricRatio(config.rubric, { isi: 3, bahasa: 2 })).toBeCloseTo(5 / 6);
    expect(rubricRatio(config.rubric, { isi: 99, bahasa: -1 })).toBeCloseTo(4 / 6);
    expect(rubricRatio([], {})).toBeNull();
  });
});

describe("essay.validate", () => {
  it("needs sensible word limits and named criteria", () => {
    expect(essay.validate(config)).toEqual([]);
    expect(essay.validate({ ...config, minWords: 300 }).map((i) => i.path)).toEqual(["maxWords"]);
    expect(essay.validate(essay.defaults()).map((i) => i.path)).toEqual(["rubric.0.criterion"]);
  });
});

describe("essay.stripAnswers", () => {
  it("sends only the word limits — no rubric, no guide", () => {
    const pub = essay.stripAnswers(config, { seed: 1, shuffle: true });
    expect(pub).toEqual({ minWords: 20, maxWords: 200 });
  });

  it("counts an answer only when it has text", () => {
    expect(essay.isAnswered({ text: "   " })).toBe(false);
    expect(essay.isAnswered({ text: "Ya" })).toBe(true);
  });
});
