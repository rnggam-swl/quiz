import { describe, expect, it } from "vitest";

import { THEME_PRESETS, themeScheme, themeStyle } from "./theme";

describe("themeStyle", () => {
  it("only sets a background when the quiz chose one", () => {
    expect(themeStyle({})).not.toHaveProperty("--theme-bg");
    expect(themeStyle({ bg: "not-a-colour" })).not.toHaveProperty("--theme-bg");
    expect(themeStyle({ bg: "#fef2f2" })).toMatchObject({ "--theme-bg": "#fef2f2" });
  });

  it("picks a readable text colour for the primary", () => {
    expect(themeStyle({ primary: "#f59e0b" })["--on-theme" as never]).toBe("#1a1a24");
    expect(themeStyle({ primary: "#1a1a24" })["--on-theme" as never]).toBe("#ffffff");
  });
});

describe("themeScheme", () => {
  it("follows the device when there is no custom background", () => {
    expect(themeScheme({})).toBeUndefined();
    expect(themeScheme(null)).toBeUndefined();
  });

  it("pins light tokens on every (light) preset and dark ones on a dark background", () => {
    for (const preset of THEME_PRESETS) expect(themeScheme(preset)).toBe("light");
    expect(themeScheme({ bg: "#0b0f19" })).toBe("dark");
  });
});
