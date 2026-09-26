import { describe, expect, it } from "vitest";

import { createRandom, deriveSeed, sample, shuffle, shuffleAvoidingIdentity } from "./seed-random";

const letters = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

describe("createRandom", () => {
  it("produces the same sequence for the same seed", () => {
    const a = createRandom(42);
    const b = createRandom(42);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it("produces different sequences for different seeds", () => {
    expect(createRandom(1)()).not.toEqual(createRandom(2)());
  });

  it("stays within [0, 1)", () => {
    const random = createRandom(123456789);
    for (let i = 0; i < 10_000; i++) {
      const n = random();
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe("shuffle", () => {
  it("is deterministic per seed", () => {
    expect(shuffle(letters, 7)).toEqual(shuffle(letters, 7));
  });

  it("keeps every item exactly once", () => {
    expect([...shuffle(letters, 99)].sort()).toEqual([...letters]);
  });

  it("does not mutate the input", () => {
    const input = [1, 2, 3, 4];
    shuffle(input, 5);
    expect(input).toEqual([1, 2, 3, 4]);
  });

  it("gives different orders across seeds", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, seed) => shuffle(letters, seed).join("")),
    );
    expect(orders.size).toBeGreaterThan(15);
  });
});

describe("shuffleAvoidingIdentity", () => {
  it("never returns the original order", () => {
    for (let seed = 0; seed < 500; seed++) {
      expect(shuffleAvoidingIdentity(["x", "y"], seed)).toEqual(["y", "x"]);
      expect(shuffleAvoidingIdentity(letters, seed).join("")).not.toBe(letters.join(""));
    }
  });

  it("returns short lists unchanged", () => {
    expect(shuffleAvoidingIdentity(["only"], 1)).toEqual(["only"]);
    expect(shuffleAvoidingIdentity([], 1)).toEqual([]);
  });
});

describe("deriveSeed", () => {
  it("is deterministic and differs per key and per seed", () => {
    expect(deriveSeed(7, "q1")).toBe(deriveSeed(7, "q1"));
    expect(deriveSeed(7, "q1")).not.toBe(deriveSeed(7, "q2"));
    expect(deriveSeed(7, "q1")).not.toBe(deriveSeed(8, "q1"));
  });

  it("gives questions with the same option count different shuffles", () => {
    const orders = new Set(
      Array.from({ length: 10 }, (_, i) =>
        shuffle(letters, deriveSeed(123, `question-${i}`)).join(""),
      ),
    );
    expect(orders.size).toBeGreaterThan(8);
  });
});

describe("sample", () => {
  it("draws distinct items, clamped to the list size", () => {
    expect(new Set(sample(letters, 5, 3)).size).toBe(5);
    expect(sample(letters, 50, 3)).toHaveLength(letters.length);
    expect(sample(letters, -1, 3)).toEqual([]);
  });

  it("is deterministic per seed", () => {
    expect(sample(letters, 3, 11)).toEqual(sample(letters, 3, 11));
  });
});
