import { describe, expect, it } from "vitest";

import { multipleChoice, type MultipleChoiceConfig } from "./definition";

const opts = (...texts: string[]) => texts.map((text, i) => ({ id: `o${i + 1}`, text }));

const single: MultipleChoiceConfig = {
  options: opts("Jakarta", "Bandung", "Surabaya", "Medan"),
  correctIds: ["o1"],
  multiple: false,
};

const multi: MultipleChoiceConfig = {
  options: opts("2", "3", "4", "5"),
  correctIds: ["o1", "o2", "o4"], // bilangan prima
  multiple: true,
};

describe("multiple_choice.score — single", () => {
  it("gives full credit for the correct option", () => {
    expect(multipleChoice.score(single, { selectedIds: ["o1"] })).toEqual({
      correct: 1,
      total: 1,
      ratio: 1,
    });
  });

  it("gives zero for a wrong option, no option, or several options", () => {
    expect(multipleChoice.score(single, { selectedIds: ["o2"] }).ratio).toBe(0);
    expect(multipleChoice.score(single, { selectedIds: [] }).ratio).toBe(0);
    expect(multipleChoice.score(single, { selectedIds: ["o1", "o2"] }).ratio).toBe(0);
  });

  it("ignores duplicate ids and unknown ids count as wrong", () => {
    expect(multipleChoice.score(single, { selectedIds: ["o1", "o1"] }).ratio).toBe(1);
    expect(multipleChoice.score(single, { selectedIds: ["nope"] }).ratio).toBe(0);
  });
});

describe("multiple_choice.score — multiple", () => {
  it("gives full credit for exactly the correct set", () => {
    expect(multipleChoice.score(multi, { selectedIds: ["o4", "o1", "o2"] }).ratio).toBe(1);
  });

  it("gives partial credit for a subset", () => {
    expect(multipleChoice.score(multi, { selectedIds: ["o1", "o2"] })).toEqual({
      correct: 2,
      total: 3,
      ratio: 2 / 3,
    });
  });

  it("wrong picks cancel right ones so selecting everything does not pay", () => {
    expect(multipleChoice.score(multi, { selectedIds: ["o1", "o2", "o3", "o4"] }).correct).toBe(2);
    expect(multipleChoice.score(multi, { selectedIds: ["o3"] }).correct).toBe(0);
  });
});

describe("multiple_choice.validate", () => {
  it("accepts a complete question", () => {
    expect(multipleChoice.validate(single)).toEqual([]);
    expect(multipleChoice.validate(multi)).toEqual([]);
  });

  it("flags the fresh default (empty options, no correct answer)", () => {
    const messages = multipleChoice.validate(multipleChoice.defaults()).map((i) => i.message);
    expect(messages).toContain("Minimal butuh 2 opsi.");
    expect(messages).toContain("Tandai minimal satu jawaban benar.");
  });

  it("flags several correct answers in single mode", () => {
    const issues = multipleChoice.validate({ ...single, correctIds: ["o1", "o2"] });
    expect(issues.map((i) => i.path)).toContain("correctIds");
  });

  it("ignores stale correct ids that point at deleted options", () => {
    const issues = multipleChoice.validate({ ...single, correctIds: ["deleted"] });
    expect(issues.map((i) => i.message)).toContain("Tandai minimal satu jawaban benar.");
  });

  it("allows at most 5 options (one per answer colour and shape)", () => {
    const six = { ...single, options: opts("1", "2", "3", "4", "5", "6") };
    expect(multipleChoice.validate(six).map((i) => i.message)).toContain("Maksimal 5 opsi.");
  });

  it("flags duplicate option texts", () => {
    const issues = multipleChoice.validate({ ...single, options: opts("A", "a ", "B") });
    expect(issues).toEqual([{ path: "options.1.text", message: '"a" sama dengan opsi 1.' }]);
  });
});

describe("multiple_choice.stripAnswers", () => {
  it("never leaks the answer key", () => {
    const pub = multipleChoice.stripAnswers(multi, { seed: 1, shuffle: true });
    expect(JSON.stringify(pub)).not.toContain("correct");
    expect(Object.keys(pub).sort()).toEqual(["multiple", "options"]);
  });

  it("shuffles deterministically per seed, or keeps order when shuffle is off", () => {
    const a = multipleChoice.stripAnswers(single, { seed: 42, shuffle: true });
    const b = multipleChoice.stripAnswers(single, { seed: 42, shuffle: true });
    expect(a).toEqual(b);
    expect(multipleChoice.stripAnswers(single, { seed: 42, shuffle: false }).options).toEqual(
      single.options,
    );
  });
});

describe("multiple_choice schemas", () => {
  it("defaults() satisfies the config schema", () => {
    expect(multipleChoice.configSchema.safeParse(multipleChoice.defaults()).success).toBe(true);
  });

  it("rejects oversized answers", () => {
    const huge = { selectedIds: Array.from({ length: 51 }, (_, i) => `x${i}`) };
    expect(multipleChoice.answerSchema.safeParse(huge).success).toBe(false);
  });
});
