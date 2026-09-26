import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase/server", () => ({ createClient: vi.fn() }));

const { safeNextPath } = await import("./auth");

describe("safeNextPath", () => {
  it("keeps same-site relative paths", () => {
    expect(safeNextPath("/quizzes/abc/edit")).toBe("/quizzes/abc/edit");
    expect(safeNextPath("/quizzes?q=ipa")).toBe("/quizzes?q=ipa");
  });

  it.each([
    "https://evil.example",
    "//evil.example",
    "/\\evil.example",
    "quizzes",
    "",
    null,
    undefined,
  ])("falls back for %j", (next) => {
    expect(safeNextPath(next)).toBe("/quizzes");
  });
});
