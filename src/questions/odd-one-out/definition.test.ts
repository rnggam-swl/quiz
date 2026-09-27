import { describe, expect, it } from "vitest";

import { oddOneOut, type OddOneOutConfig } from "./definition";

const config: OddOneOutConfig = {
  items: [
    { id: "a", text: "Merkurius" },
    { id: "b", text: "Venus" },
    { id: "c", text: "Bulan" },
    { id: "d", text: "Mars" },
  ],
  oddId: "c",
  reason: "Bulan adalah satelit, bukan planet.",
};

describe("oddOneOut.score", () => {
  it("is right only for the odd item", () => {
    expect(oddOneOut.score(config, { selectedId: "c" }).ratio).toBe(1);
    expect(oddOneOut.score(config, { selectedId: "a" }).ratio).toBe(0);
    expect(oddOneOut.score(config, { selectedId: "zzz" }).ratio).toBe(0);
  });

  it("never matches when no odd item is set yet", () => {
    expect(oddOneOut.score({ ...config, oddId: "" }, { selectedId: "" }).ratio).toBe(0);
  });
});

describe("oddOneOut.validate", () => {
  it("accepts a complete question", () => {
    expect(oddOneOut.validate(config)).toEqual([]);
  });

  it("needs 3 items, texts, an odd item and no duplicates", () => {
    const paths = oddOneOut.validate(oddOneOut.defaults()).map((i) => i.path);
    expect(paths).toContain("items.0.text");
    expect(paths).toContain("oddId");
    expect(
      oddOneOut.validate({ ...config, items: config.items.slice(0, 2) }).map((i) => i.path),
    ).toContain("items");
    const dup = { ...config, items: [...config.items, { id: "e", text: "venus " }] };
    expect(oddOneOut.validate(dup).map((i) => i.path)).toEqual(["items.4.text"]);
  });
});

describe("oddOneOut.stripAnswers", () => {
  it("drops the odd id and the reason, and shuffles when allowed", () => {
    const pub = oddOneOut.stripAnswers(config, { seed: 3, shuffle: true });
    expect(pub).toEqual({ items: expect.arrayContaining(config.items) });
    expect(Object.keys(pub)).toEqual(["items"]);
    expect(oddOneOut.stripAnswers(config, { seed: 3, shuffle: false }).items).toEqual(config.items);
  });
});
