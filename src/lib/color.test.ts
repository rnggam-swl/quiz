import { describe, expect, it } from "vitest";

import {
  contrastRatio,
  parseHex,
  readableTextColor,
  relativeLuminance,
  TEXT_ON_DARK,
  TEXT_ON_LIGHT,
} from "./color";

describe("parseHex", () => {
  it("parses 6- and 3-digit hex with or without #", () => {
    expect(parseHex("#2563eb")).toEqual([37, 99, 235]);
    expect(parseHex("fff")).toEqual([255, 255, 255]);
  });

  it("rejects invalid input", () => {
    expect(parseHex("blue")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
  });
});

describe("contrastRatio", () => {
  it("matches the WCAG extremes", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21);
    expect(contrastRatio("#777", "#777")).toBeCloseTo(1);
  });

  it("is symmetric", () => {
    expect(contrastRatio("#2563eb", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#2563eb"));
  });
});

describe("answer palette", () => {
  // Must stay in sync with --answer-* in src/app/globals.css.
  const palette: [string, string][] = [
    ["#ce2c31", TEXT_ON_DARK],
    ["#2f6feb", TEXT_ON_DARK],
    ["#f5a524", TEXT_ON_LIGHT],
    ["#0b7a6d", TEXT_ON_DARK],
    ["#8e4ec6", TEXT_ON_DARK],
  ];

  it.each(palette)("%s meets WCAG AA (4.5:1) with its text colour", (bg, fg) => {
    expect(contrastRatio(bg, fg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("readableTextColor", () => {
  it("picks dark text on light or saturated-light backgrounds", () => {
    expect(readableTextColor("#f5a524")).toBe(TEXT_ON_LIGHT);
    expect(readableTextColor("#10b981")).toBe(TEXT_ON_LIGHT);
    expect(readableTextColor("#ffffff")).toBe(TEXT_ON_LIGHT);
  });

  it("picks white text on dark backgrounds", () => {
    expect(readableTextColor("#4f5bea")).toBe(TEXT_ON_DARK);
    expect(readableTextColor("#1a1a24")).toBe(TEXT_ON_DARK);
  });
});
