import { describe, expect, it } from "vitest";

import { sequencing, type SequencingConfig } from "./definition";

const items = ["A", "B", "C", "D", "E"].map((id) => ({ id, text: `Langkah ${id}` }));
const adjacent: SequencingConfig = { items, scoring: "adjacent" };
const position: SequencingConfig = { items, scoring: "position" };
const order = (s: string) => ({ orderedIds: s.split("") });

describe("sequencing.score", () => {
  it("gives full credit for the right order in both modes", () => {
    expect(sequencing.score(adjacent, order("ABCDE"))).toEqual({ correct: 4, total: 4, ratio: 1 });
    expect(sequencing.score(position, order("ABCDE"))).toEqual({ correct: 5, total: 5, ratio: 1 });
  });

  it("adjacent scoring barely punishes one item moved to the front", () => {
    // E moved first: A→B, B→C, C→D still right; only D→E is lost.
    expect(sequencing.score(adjacent, order("EABCD")).correct).toBe(3);
    // Position scoring gets every slot wrong for the same mistake.
    expect(sequencing.score(position, order("EABCD")).correct).toBe(0);
  });

  it("gives nothing for a reversed order", () => {
    expect(sequencing.score(adjacent, order("EDCBA")).correct).toBe(0);
    expect(sequencing.score(position, order("EDCBA")).correct).toBe(1); // C stays in the middle
  });

  it("ignores unknown and repeated ids", () => {
    expect(sequencing.score(adjacent, order("AABXC")).correct).toBe(2); // A→B, B→C
    expect(sequencing.score(adjacent, order("AAAA")).correct).toBe(0);
    expect(sequencing.score(position, { orderedIds: ["A", "A", "A"] }).correct).toBe(1);
    expect(sequencing.score(adjacent, { orderedIds: [] }).ratio).toBe(0);
  });
});

describe("sequencing.validate", () => {
  it("accepts a complete question", () => {
    expect(sequencing.validate(adjacent)).toEqual([]);
  });

  it("needs 3 filled, distinct items", () => {
    expect(sequencing.validate({ ...adjacent, items: items.slice(0, 2) })[0]?.path).toBe("items");
    expect(sequencing.validate(sequencing.defaults()).map((i) => i.path)).toContain("items.0.text");
    const dup = { ...adjacent, items: [...items, { id: "F", text: "langkah a" }] };
    expect(sequencing.validate(dup).map((i) => i.path)).toEqual(["items.5.text"]);
  });
});

describe("sequencing.stripAnswers", () => {
  it("never sends the items in the correct order", () => {
    for (let seed = 0; seed < 100; seed++) {
      const pub = sequencing.stripAnswers(adjacent, { seed, shuffle: false });
      expect(pub.items.map((i) => i.id)).not.toEqual(["A", "B", "C", "D", "E"]);
      expect(pub).not.toHaveProperty("scoring");
    }
  });
});
