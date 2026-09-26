import { describe, expect, it } from "vitest";

import { detectParentOrigin, parseHostMessage } from "./embed-protocol";

describe("parseHostMessage", () => {
  it("accepts known host messages and sanitizes their payload", () => {
    expect(parseHostMessage({ source: "quiz-host", type: "restart" })).toEqual({
      type: "restart",
      payload: {},
    });
    expect(
      parseHostMessage({
        source: "quiz-host",
        type: "setTheme",
        payload: { primary: "#12AB34", mode: "dark" },
      }),
    ).toEqual({ type: "setTheme", payload: { primary: "#12AB34", mode: "dark" } });
    expect(
      parseHostMessage({
        source: "quiz-host",
        type: "setTheme",
        payload: { primary: "red; background:url(x)", mode: "neon" },
      }),
    ).toEqual({ type: "setTheme", payload: { primary: undefined, mode: undefined } });
  });

  it("ignores anything else", () => {
    for (const bad of [
      null,
      "restart",
      {},
      { source: "other", type: "restart" },
      { source: "quiz-host", type: "hack" },
    ]) {
      expect(parseHostMessage(bad)).toBeNull();
    }
  });
});

describe("detectParentOrigin", () => {
  const allowed = ["https://sekolah.id", "http://localhost:5500"];

  it("prefers ancestorOrigins, falls back to the referrer", () => {
    expect(detectParentOrigin(allowed, ["https://sekolah.id"], "")).toBe("https://sekolah.id");
    expect(detectParentOrigin(allowed, [], "http://localhost:5500/demo.html?x=1")).toBe(
      "http://localhost:5500",
    );
  });

  it("returns null for origins that aren't allowed", () => {
    expect(detectParentOrigin(allowed, ["https://evil.test"], "https://evil.test/")).toBeNull();
    expect(detectParentOrigin(allowed, [], "")).toBeNull();
    expect(detectParentOrigin(allowed, [], "not a url")).toBeNull();
  });
});
