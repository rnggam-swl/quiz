import { describe, expect, it } from "vitest";

import { slider, snapToStep, type SliderConfig } from "./definition";

const config: SliderConfig = {
  min: 0,
  max: 100,
  step: 1,
  value: 60,
  tolerance: 2,
  partial: false,
};

describe("slider.score", () => {
  it("gives full credit within the tolerance", () => {
    expect(slider.score(config, { value: 60 }).ratio).toBe(1);
    expect(slider.score(config, { value: 62 }).ratio).toBe(1);
    expect(slider.score(config, { value: 57.5 }).ratio).toBe(0);
  });

  it("gives partial credit that shrinks with the distance when enabled", () => {
    const partial = { ...config, partial: true };
    // 10 beyond the tolerance on a range of 100 → 1 − 0.1 × 2.
    expect(slider.score(partial, { value: 72 }).ratio).toBeCloseTo(0.8);
    expect(slider.score(partial, { value: 0 }).ratio).toBe(0);
    expect(slider.score(partial, { value: -500 }).ratio).toBe(0);
  });

  it("returns a total of 1 so the ratio drives the points", () => {
    expect(slider.score({ ...config, partial: true }, { value: 72 }).total).toBe(1);
  });
});

describe("slider.validate", () => {
  it("accepts the defaults", () => {
    expect(slider.validate(slider.defaults())).toEqual([]);
  });

  it("rejects an empty range, an out-of-range answer and an unreachable answer", () => {
    expect(slider.validate({ ...config, max: 0 }).map((i) => i.path)).toEqual(["max"]);
    expect(slider.validate({ ...config, value: 120 }).map((i) => i.path)).toEqual(["value"]);
    expect(
      slider.validate({ ...config, step: 5, value: 62, tolerance: 0 }).map((i) => i.path),
    ).toEqual(["value"]);
    expect(slider.validate({ ...config, step: 5, value: 62, tolerance: 2 })).toEqual([]);
  });

  it("rejects steps that are too big or too small", () => {
    expect(slider.validate({ ...config, step: 200 }).map((i) => i.path)).toContain("step");
    expect(slider.validate({ ...config, step: 0.01 }).map((i) => i.path)).toContain("step");
  });
});

describe("slider.stripAnswers", () => {
  it("sends the scale only", () => {
    expect(slider.stripAnswers({ ...config, unit: "°C" }, { seed: 1, shuffle: true })).toEqual({
      min: 0,
      max: 100,
      step: 1,
      unit: "°C",
    });
  });
});

describe("snapToStep", () => {
  it("snaps to the nearest stop inside the range without float noise", () => {
    const scale = { min: 0, max: 1, step: 0.1 };
    expect(snapToStep(0.34, scale)).toBe(0.3);
    expect(snapToStep(0.36, scale)).toBe(0.4);
    expect(snapToStep(5, scale)).toBe(1);
  });
});
