import { describe, expect, it } from "vitest";

import { hits, hotspot, judgeClicks, type HotspotConfig } from "./definition";

// A wide image (height = half the width) with two spots.
const config: HotspotConfig = {
  image: { kind: "image", url: "https://example.test/sel.png", alt: "Sel hewan" },
  aspect: 0.5,
  spots: [
    { id: "s1", x: 20, y: 50, r: 5, label: "Inti sel" },
    { id: "s2", x: 70, y: 30, r: 5 },
  ],
  maxClicks: null,
};
const at = (x: number, y: number) => ({ x, y });

describe("hits", () => {
  it("measures vertical distance in width units", () => {
    const spot = config.spots[0]!;
    // 8% of the height is only 4% of the width on a 2:1 image — inside a 5% radius.
    expect(hits(spot, at(20, 58), 0.5)).toBe(true);
    expect(hits(spot, at(20, 58), 1)).toBe(false);
    expect(hits(spot, at(26, 50), 0.5)).toBe(false);
  });
});

describe("hotspot.score", () => {
  it("gives full credit for finding every spot", () => {
    expect(hotspot.score(config, { clicks: [at(21, 51), at(70, 30)] })).toEqual({
      correct: 2,
      total: 2,
      ratio: 1,
    });
  });

  it("subtracts misses from found spots", () => {
    expect(
      hotspot.score({ ...config, maxClicks: 3 }, { clicks: [at(20, 50), at(5, 5)] }).correct,
    ).toBe(0);
    expect(
      hotspot.score({ ...config, maxClicks: 3 }, { clicks: [at(20, 50), at(70, 30), at(5, 5)] })
        .correct,
    ).toBe(1);
  });

  it("ignores clicks beyond the allowance, so clicking everywhere doesn't pay", () => {
    const grid = Array.from({ length: 30 }, (_, i) => at((i % 6) * 18, Math.floor(i / 6) * 22));
    expect(hotspot.score(config, { clicks: grid }).correct).toBe(0);
    // With the default allowance (one per spot) only the first two clicks count.
    expect(hotspot.score(config, { clicks: [at(20, 50), at(70, 30), at(1, 1)] }).ratio).toBe(1);
  });

  it("does not count a second click on a found spot as a miss", () => {
    const judged = judgeClicks({ ...config, maxClicks: 3 }, [at(20, 50), at(21, 50), at(70, 30)]);
    expect(judged.results.map((r) => r.result)).toEqual(["found", "repeat", "found"]);
    expect(
      hotspot.score({ ...config, maxClicks: 3 }, { clicks: [at(20, 50), at(21, 50)] }).correct,
    ).toBe(1);
  });

  it("gives nothing without clicks", () => {
    expect(hotspot.score(config, { clicks: [] }).ratio).toBe(0);
  });
});

describe("hotspot.validate", () => {
  it("needs an image, a spot and enough clicks", () => {
    expect(hotspot.validate(config)).toEqual([]);
    expect(hotspot.validate(hotspot.defaults()).map((i) => i.path)).toEqual(["image"]);
    expect(hotspot.validate({ ...config, spots: [] }).map((i) => i.path)).toEqual(["spots"]);
    expect(hotspot.validate({ ...config, maxClicks: 1 }).map((i) => i.path)).toEqual(["maxClicks"]);
  });
});

describe("hotspot.stripAnswers", () => {
  it("sends the image and counts, never the spots", () => {
    const pub = hotspot.stripAnswers(config, { seed: 1, shuffle: true });
    expect(pub).toEqual({ image: config.image, aspect: 0.5, spotCount: 2, maxClicks: 2 });
    expect(JSON.stringify(pub)).not.toContain("Inti sel");
  });
});
