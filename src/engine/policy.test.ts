import { describe, expect, it } from "vitest";

import { SESSION_MODES } from "@/questions/types";

import { DEFAULT_POLICIES, policySchema, resolvePolicy } from "./policy";

describe("DEFAULT_POLICIES", () => {
  it.each(SESSION_MODES)("%s default is a valid policy", (mode) => {
    expect(policySchema.safeParse(DEFAULT_POLICIES[mode]).success).toBe(true);
  });

  it("practice is forgiving and exam is strict", () => {
    expect(DEFAULT_POLICIES.practice).toMatchObject({ feedback: "instant", attempts: 0 });
    expect(DEFAULT_POLICIES.exam).toMatchObject({
      feedback: "none",
      gamification: false,
      attempts: 1,
      allowEmbed: false,
      navigation: "free",
      integrity: { fullscreen: true, logTabSwitch: true, blockCopyPaste: true },
    });
  });
});

describe("resolvePolicy", () => {
  it("fills missing fields from the mode default", () => {
    expect(resolvePolicy("practice", { feedback: "end" })).toEqual({
      ...DEFAULT_POLICIES.practice,
      feedback: "end",
    });
  });

  it("falls back to the default for garbage", () => {
    expect(resolvePolicy("practice", "nope")).toEqual(DEFAULT_POLICIES.practice);
    expect(resolvePolicy("practice", { attempts: -3 })).toEqual(DEFAULT_POLICIES.practice);
    expect(resolvePolicy("exam", null)).toEqual(DEFAULT_POLICIES.exam);
  });
});

describe("exam settings", () => {
  it("accepts a question pool and a passcode, and rejects bad ones", () => {
    expect(
      resolvePolicy("exam", { questionPool: { size: 40, tags: ["bab-1"] }, passcode: "IPA8" }),
    ).toMatchObject({ questionPool: { size: 40, tags: ["bab-1"] }, passcode: "IPA8" });
    expect(resolvePolicy("exam", { questionPool: { size: 0 } })).toEqual(DEFAULT_POLICIES.exam);
    expect(resolvePolicy("exam", { passcode: "   " })).toEqual(DEFAULT_POLICIES.exam);
  });

  it("ignores the retired requireLogin flag", () => {
    expect(resolvePolicy("exam", { requireLogin: true, access: "roster" }).access).toBe("roster");
  });
});
