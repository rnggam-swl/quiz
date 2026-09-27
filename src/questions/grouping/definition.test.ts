import { describe, expect, it } from "vitest";

import { grouping, type GroupingConfig } from "./definition";

const config: GroupingConfig = {
  groups: [
    { id: "g1", name: "Mamalia" },
    { id: "g2", name: "Reptil" },
  ],
  items: [
    { id: "a", text: "Kucing", groupId: "g1" },
    { id: "b", text: "Paus", groupId: "g1" },
    { id: "c", text: "Kadal", groupId: "g2" },
    { id: "d", text: "Ular", groupId: "g2" },
  ],
};

describe("grouping.score", () => {
  it("counts items placed in their own group", () => {
    const all = { placement: { a: "g1", b: "g1", c: "g2", d: "g2" } };
    expect(grouping.score(config, all)).toEqual({ correct: 4, total: 4, ratio: 1 });
    expect(grouping.score(config, { placement: { a: "g1", b: "g2", c: "g1" } }).correct).toBe(1);
  });

  it("gives nothing for unplaced items or unknown groups", () => {
    expect(grouping.score(config, { placement: {} }).ratio).toBe(0);
    expect(grouping.score(config, { placement: { a: "nope", zz: "g1" } }).correct).toBe(0);
  });

  it("ignores inherited keys", () => {
    const sneaky = JSON.parse('{"placement":{"__proto__":{"a":"g1"}}}') as {
      placement: Record<string, string>;
    };
    expect(grouping.score(config, sneaky).correct).toBe(0);
  });
});

describe("grouping.validate", () => {
  it("accepts a complete question", () => {
    expect(grouping.validate(config)).toEqual([]);
  });

  it("needs 2 named groups, each with an item, and filled items", () => {
    const paths = grouping.validate(grouping.defaults()).map((i) => i.path);
    expect(paths).toContain("groups.0.name");
    expect(paths).toContain("items.0.text");

    const lonely = { ...config, items: config.items.filter((i) => i.groupId === "g1") };
    expect(grouping.validate(lonely).map((i) => i.message)).toEqual([
      'Kelompok "Reptil" belum punya item.',
    ]);
    expect(grouping.validate({ ...config, groups: config.groups.slice(0, 1) })[0]?.path).toBe(
      "groups",
    );
  });
});

describe("grouping.stripAnswers", () => {
  it("drops each item's group and never keeps the authored order", () => {
    for (let seed = 0; seed < 50; seed++) {
      const pub = grouping.stripAnswers(config, { seed, shuffle: false });
      expect(JSON.stringify(pub)).not.toContain("groupId");
      expect(pub.items.map((i) => i.id)).not.toEqual(["a", "b", "c", "d"]);
      expect(pub.groups).toEqual(config.groups);
    }
  });
});
