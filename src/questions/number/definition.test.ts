import { describe, expect, it } from "vitest";

import { numberQuestion, parseNumberInput } from "./definition";

describe("number.score", () => {
  it("requires an exact match with zero tolerance, ignoring float noise", () => {
    const config = { value: 0.3, tolerance: 0 };
    expect(numberQuestion.score(config, { value: 0.1 + 0.2 }).ratio).toBe(1);
    expect(numberQuestion.score(config, { value: 0.31 }).ratio).toBe(0);
  });

  it("accepts answers within the tolerance on both sides", () => {
    const config = { value: 100, tolerance: 5 };
    expect(numberQuestion.score(config, { value: 95 }).ratio).toBe(1);
    expect(numberQuestion.score(config, { value: 105 }).ratio).toBe(1);
    expect(numberQuestion.score(config, { value: 105.5 }).ratio).toBe(0);
  });

  it("rejects non-finite answers at the schema level", () => {
    expect(numberQuestion.answerSchema.safeParse({ value: Infinity }).success).toBe(false);
    expect(numberQuestion.answerSchema.safeParse({ value: NaN }).success).toBe(false);
  });
});

describe("number.stripAnswers", () => {
  it("only passes the unit through", () => {
    const ctx = { seed: 1, shuffle: false };
    expect(numberQuestion.stripAnswers({ value: 9.8, tolerance: 0.1, unit: "m/s²" }, ctx)).toEqual({
      unit: "m/s²",
    });
    expect(numberQuestion.stripAnswers({ value: 3, tolerance: 0 }, ctx)).toEqual({});
  });
});

describe("parseNumberInput", () => {
  it.each([
    ["42", 42],
    ["-3.5", -3.5],
    ["3,5", 3.5],
    ["1.250,75", 1250.75],
    [" 1e3 ", 1000],
    [".5", 0.5],
  ])("parses %j", (raw, expected) => {
    expect(parseNumberInput(raw)).toBe(expected);
  });

  it.each(["", "abc", "1,2,3", "12a", "--1"])("rejects %j", (raw) => {
    expect(parseNumberInput(raw)).toBeNull();
  });
});
