import { describe, expect, it } from "vitest";

import { examFormSchema, examPolicy, type ExamForm } from "./form";

const base: ExamForm = {
  title: "UTS IPA",
  opensAt: "2026-10-01T01:00:00.000Z",
  closesAt: "2026-10-01T03:00:00.000Z",
  durationMin: 60,
  poolSize: null,
  poolTags: [],
  shuffleQuestions: true,
  shuffleOptions: true,
  attempts: 1,
  attemptScoring: "highest",
  navigation: "free",
  releaseResults: "after_close",
  showCorrectAnswer: false,
  fullscreen: true,
  logTabSwitch: true,
  blockCopyPaste: true,
  access: "open",
  passcode: "",
};

describe("examFormSchema", () => {
  it("accepts a complete form and trims text", () => {
    const parsed = examFormSchema.parse({ ...base, title: "  UTS  ", passcode: " IPA8 " });
    expect(parsed.title).toBe("UTS");
    expect(parsed.passcode).toBe("IPA8");
  });

  it("requires a title and a window that closes after it opens", () => {
    expect(examFormSchema.safeParse({ ...base, title: " " }).success).toBe(false);
    const flipped = examFormSchema.safeParse({
      ...base,
      opensAt: base.closesAt,
      closesAt: base.opensAt,
    });
    expect(flipped.success).toBe(false);
    expect(flipped.error?.issues[0]?.path).toEqual(["closesAt"]);
  });

  it("allows an open-ended window and no time limit", () => {
    expect(
      examFormSchema.safeParse({ ...base, opensAt: null, closesAt: null, durationMin: null })
        .success,
    ).toBe(true);
  });

  it("rejects out-of-range numbers and non-ISO dates", () => {
    expect(examFormSchema.safeParse({ ...base, durationMin: 0 }).success).toBe(false);
    expect(examFormSchema.safeParse({ ...base, durationMin: 361 }).success).toBe(false);
    expect(examFormSchema.safeParse({ ...base, attempts: 11 }).success).toBe(false);
    expect(examFormSchema.safeParse({ ...base, opensAt: "besok pagi" }).success).toBe(false);
  });
});

describe("examPolicy", () => {
  it("turns the form into an exam policy", () => {
    const policy = examPolicy(examFormSchema.parse(base));
    expect(policy.timer).toEqual({ totalS: 3600 });
    expect(policy.feedback).toBe("none");
    expect(policy.gamification).toBe(false);
    expect(policy.access).toBe("open");
    expect(policy.passcode).toBeUndefined();
    expect(policy.questionPool).toBeUndefined();
    expect(policy.integrity).toEqual({
      fullscreen: true,
      logTabSwitch: true,
      blockCopyPaste: true,
    });
  });

  it("includes a question pool with tags, a passcode and the chosen rules", () => {
    const policy = examPolicy(
      examFormSchema.parse({
        ...base,
        durationMin: null,
        poolSize: 40,
        poolTags: ["bab 1"],
        attempts: 3,
        attemptScoring: "average",
        navigation: "forward",
        releaseResults: "manual",
        fullscreen: false,
        access: "roster",
        passcode: "IPA8",
      }),
    );
    expect(policy.timer).toEqual({});
    expect(policy.questionPool).toEqual({ size: 40, tags: ["bab 1"] });
    expect(policy.attempts).toBe(3);
    expect(policy.attemptScoring).toBe("average");
    expect(policy.navigation).toBe("forward");
    expect(policy.releaseResults).toBe("manual");
    expect(policy.integrity.fullscreen).toBe(false);
    expect(policy.access).toBe("roster");
    expect(policy.passcode).toBe("IPA8");
  });

  it("leaves tags out of a pool without them", () => {
    const policy = examPolicy(examFormSchema.parse({ ...base, poolSize: 10 }));
    expect(policy.questionPool).toEqual({ size: 10 });
  });
});
