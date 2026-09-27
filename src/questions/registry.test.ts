import { describe, expect, it } from "vitest";

import { getDefinition, isQuestionType, QUESTION_TYPES, questionDefinitions } from "./registry";

/** Config keys that hold the answer key and must never appear in stripped payloads. */
const ANSWER_KEYS: Record<keyof typeof questionDefinitions, string[]> = {
  multiple_choice: ["correctIds"],
  true_false: ["correct"],
  short_answer: ["accepted", "fuzzy", "caseSensitive"],
  number: ["value", "tolerance"],
  matching: ["pairs"],
  slider: ["value", "tolerance", "partial"],
  odd_one_out: ["oddId", "reason"],
  sequencing: ["scoring"],
  grouping: ["groupId"],
  word_blank: ["blanks", "caseSensitive"],
  hotspot: ["spots"],
  branching: ["correct", "score", "scoring"],
};

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => collectKeys(v, keys));
  else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      keys.add(k);
      collectKeys(v, keys);
    }
  }
  return keys;
}

describe.each(QUESTION_TYPES)("question type contract: %s", (type) => {
  const definition = getDefinition(type);

  it("is registered under its own type key", () => {
    expect(definition.type).toBe(type);
    expect(isQuestionType(type)).toBe(true);
  });

  it("defaults() satisfies the config schema and yields fresh ids each time", () => {
    const a = definition.defaults();
    expect(definition.configSchema.safeParse(a).success).toBe(true);
    const b = definition.defaults();
    if (JSON.stringify(a).includes('"id"')) expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  it("stripAnswers never exposes answer-key fields", () => {
    const stripped = definition.stripAnswers(definition.defaults(), { seed: 7, shuffle: true });
    const keys = collectKeys(stripped);
    for (const forbidden of ANSWER_KEYS[type]) expect(keys.has(forbidden)).toBe(false);
  });

  it("isAnswered treats null/undefined as unanswered", () => {
    expect(definition.isAnswered(null)).toBe(false);
    expect(definition.isAnswered(undefined)).toBe(false);
  });

  it("declares at least one playable mode", () => {
    expect(Object.keys(definition.capabilities.modes).length).toBeGreaterThan(0);
  });
});

describe("isQuestionType", () => {
  it("rejects unknown and prototype keys", () => {
    expect(isQuestionType("essay")).toBe(false);
    expect(isQuestionType("toString")).toBe(false);
    expect(isQuestionType("__proto__")).toBe(false);
  });
});
