import { afterEach, describe, expect, it, vi } from "vitest";

import { geminiModels } from "./env.server";

afterEach(() => vi.unstubAllEnvs());

describe("geminiModels", () => {
  it("defaults to the newest Flash with the previous one as fallback", () => {
    vi.stubEnv("GEMINI_MODEL", "");
    expect(geminiModels()).toEqual(["gemini-3.8-flash", "gemini-3.7-flash"]);
  });

  it("takes one model, or several in order, without blanks or repeats", () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-3.7-flash");
    expect(geminiModels()).toEqual(["gemini-3.7-flash"]);
    vi.stubEnv("GEMINI_MODEL", " gemini-3.8-flash, ,gemini-3.6-flash,gemini-3.8-flash ");
    expect(geminiModels()).toEqual(["gemini-3.8-flash", "gemini-3.6-flash"]);
  });
});
