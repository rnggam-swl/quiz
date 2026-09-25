import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("keeps a colour token and a font size together", () => {
    expect(cn("text-sm", "text-fg")).toBe("text-sm text-fg");
  });

  it("lets a later colour token override an earlier one", () => {
    expect(cn("bg-surface text-fg", "bg-accent")).toBe("text-fg bg-accent");
  });

  it("drops falsy values", () => {
    expect(cn("px-2", false, undefined, null, "py-1")).toBe("px-2 py-1");
  });
});
