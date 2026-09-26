import { describe, expect, it } from "vitest";

import { matching, type MatchingConfig } from "./definition";

// Two items; "Hewan" has two pairs (one-to-many), plus one distractor on the right.
const config: MatchingConfig = {
  left: [
    { id: "L1", text: "Hewan" },
    { id: "L2", text: "Tumbuhan" },
  ],
  right: [
    { id: "R1", text: "Kucing" },
    { id: "R2", text: "Ikan" },
    { id: "R3", text: "Mawar" },
    { id: "R4", text: "Batu" },
  ],
  pairs: [
    { leftId: "L1", rightId: "R1" },
    { leftId: "L1", rightId: "R2" },
    { leftId: "L2", rightId: "R3" },
  ],
};
const answer = (...pairs: [string, string][]) => ({
  pairs: pairs.map(([leftId, rightId]) => ({ leftId, rightId })),
});

describe("matching.score", () => {
  it("gives full credit for every correct pair", () => {
    expect(matching.score(config, answer(["L1", "R1"], ["L1", "R2"], ["L2", "R3"]))).toEqual({
      correct: 3,
      total: 3,
      ratio: 1,
    });
  });

  it("gives partial credit and subtracts wrong pairs", () => {
    expect(matching.score(config, answer(["L1", "R1"])).correct).toBe(1);
    expect(matching.score(config, answer(["L1", "R1"], ["L2", "R4"])).correct).toBe(0);
  });

  it("connecting everything to everything does not pay", () => {
    const all = config.left.flatMap((l) =>
      config.right.map((r) => [l.id, r.id] as [string, string]),
    );
    expect(matching.score(config, answer(...all)).correct).toBe(0);
  });

  it("counts duplicate pairs once", () => {
    expect(matching.score(config, answer(["L1", "R1"], ["L1", "R1"])).correct).toBe(1);
  });

  it("ignores key pairs that point at deleted items", () => {
    const stale = { ...config, pairs: [...config.pairs, { leftId: "L1", rightId: "gone" }] };
    expect(matching.score(stale, answer(["L1", "R1"], ["L1", "R2"], ["L2", "R3"])).ratio).toBe(1);
  });
});

describe("matching.validate", () => {
  it("accepts one-to-many pairs and an unpaired distractor", () => {
    expect(matching.validate(config)).toEqual([]);
  });

  it("flags items without a pair and rights paired twice", () => {
    const issues = matching.validate({
      ...config,
      pairs: [
        { leftId: "L1", rightId: "R1" },
        { leftId: "L2", rightId: "R1" },
      ],
    });
    expect(issues.map((i) => i.path)).toEqual(["right.0"]);

    const lonely = matching.validate({ ...config, pairs: [{ leftId: "L1", rightId: "R1" }] });
    expect(lonely.map((i) => i.message)).toContain('"Tumbuhan" belum punya pasangan.');
  });

  it("flags empty texts in the default config", () => {
    const paths = matching.validate(matching.defaults()).map((i) => i.path);
    expect(paths).toContain("left.0.text");
    expect(paths).toContain("right.0.text");
  });
});

describe("matching.stripAnswers", () => {
  it("removes pairs and always shuffles the right column away from authored order", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pub = matching.stripAnswers(config, { seed, shuffle: false });
      expect(pub).not.toHaveProperty("pairs");
      expect(pub.left).toEqual(config.left);
      expect(pub.right.map((r) => r.id)).not.toEqual(config.right.map((r) => r.id));
    }
  });
});
