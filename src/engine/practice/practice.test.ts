import { describe, expect, it } from "vitest";

import { DEFAULT_POLICIES, type Policy } from "@/engine/policy";

import {
  answeredState,
  gradeAnswer,
  outcomeFor,
  planAttempt,
  summarize,
  toPlayQuestion,
  type StoredResponse,
} from "./attempt";
import { advance, EMPTY_PROGRESS, progressOf, reactionFor, scoreBand } from "./gamification";
import { createLocalPracticeAdapter } from "./local";
import { isBlockedNickname, nicknameSchema } from "./nickname";
import { parseSnapshot, type Snapshot } from "./snapshot";

const practice = DEFAULT_POLICIES.practice;
const full = { correct: 1, total: 1, ratio: 1 };
const half = { correct: 1, total: 2, ratio: 0.5 };
const wrong = { correct: 0, total: 1, ratio: 0 };

const mcId = crypto.randomUUID();
const tfId = crypto.randomUUID();
const rawSnapshot = {
  quiz: { id: "quiz-1", title: "Kuis", description: "", cover_url: null, theme: {} },
  questions: [
    {
      id: mcId,
      type: "multiple_choice",
      prompt: "Ibu kota?",
      help: "",
      media: [],
      config: {
        options: [
          { id: "a", text: "Jakarta" },
          { id: "b", text: "Bandung" },
          { id: "c", text: "Medan" },
        ],
        correctIds: ["a"],
        multiple: false,
      },
      time_limit_s: null,
      points: 1000,
      explanation: "Sampai 2024.",
    },
    {
      id: tfId,
      type: "true_false",
      prompt: "Bumi bulat?",
      help: "",
      media: [],
      config: { correct: true },
      time_limit_s: null,
      points: 500,
      explanation: "",
    },
    { id: crypto.randomUUID(), type: "puzzle", prompt: "?", config: {}, points: 1000 },
    { id: crypto.randomUUID(), type: "true_false", prompt: "rusak", config: { correct: "ya" } },
  ],
};
const snapshot = parseSnapshot(rawSnapshot) as Snapshot;

describe("gamification", () => {
  it("adds 10 XP per full answer plus a capped streak bonus", () => {
    const after = [full, full, full].reduce(advance, EMPTY_PROGRESS);
    expect(after).toEqual({ xp: 10 + 12 + 14, streak: 3, maxStreak: 3 });
    const long = progressOf(Array.from({ length: 10 }, () => full));
    expect(long.xp).toBe(10 + 12 + 14 + 16 + 18 + 20 * 5);
  });

  it("gives partial XP and resets the streak on partial or wrong answers", () => {
    expect(progressOf([full, half])).toEqual({ xp: 15, streak: 0, maxStreak: 1 });
    expect(progressOf([full, full, wrong, full])).toEqual({ xp: 32, streak: 1, maxStreak: 2 });
  });

  it("ignores unscored questions", () => {
    expect(advance(EMPTY_PROGRESS, { correct: 0, total: 0, ratio: 0 })).toBe(EMPTY_PROGRESS);
  });

  it("reacts like the prototype", () => {
    expect(reactionFor(full, 1).message).toBe("Mantap!");
    expect(reactionFor(full, 3).emoji).toBe("🔥");
    expect(reactionFor(full, 7).message).toBe("Unstoppable!");
    expect(reactionFor(half, 0).tone).toBe("ok");
    expect(reactionFor(wrong, 0, 0).message).toBe("Belum pas, coba lagi ya");
    expect(reactionFor(wrong, 0, 0.99).tone).toBe("soft");
  });

  it("bands scores", () => {
    expect([scoreBand(80), scoreBand(79), scoreBand(50), scoreBand(49)]).toEqual([
      "great",
      "ok",
      "ok",
      "low",
    ]);
  });
});

describe("nickname", () => {
  it("normalizes whitespace and enforces length", () => {
    expect(nicknameSchema.parse("  Budi   Santoso ")).toBe("Budi Santoso");
    expect(nicknameSchema.safeParse("   ").success).toBe(false);
    expect(nicknameSchema.safeParse("x".repeat(25)).success).toBe(false);
  });

  it("blocks rude names, including simple leetspeak, but not real names", () => {
    expect(isBlockedNickname("B@ngs4t!")).toBe(true);
    expect(isBlockedNickname("si goblok")).toBe(true);
    for (const ok of ["Asuka", "Babita", "Dickson", "Siti Nurhaliza"]) {
      expect(isBlockedNickname(ok)).toBe(false);
    }
  });
});

describe("parseSnapshot", () => {
  it("drops unknown types and configs that no longer match their schema", () => {
    expect(snapshot.questions.map((q) => q.id)).toEqual([mcId, tfId]);
    expect(snapshot.quiz).toMatchObject({ title: "Kuis", coverUrl: null });
  });

  it("rejects garbage", () => {
    expect(parseSnapshot({ nope: true })).toBeNull();
  });
});

describe("attempt planning & grading", () => {
  it("keeps authored order unless questions are shuffled, and sums max score", () => {
    expect(planAttempt(snapshot, practice, 1)).toEqual({
      questionIds: [mcId, tfId],
      maxScore: 1500,
    });
    const shuffled = new Set(
      Array.from({ length: 20 }, (_, seed) =>
        planAttempt(snapshot, { ...practice, shuffleQuestions: true }, seed).questionIds.join(),
      ),
    );
    expect(shuffled.size).toBe(2);
  });

  it("draws a question pool by seed, optionally filtered by tags", () => {
    const bank: Snapshot = {
      quiz: snapshot.quiz,
      questions: Array.from({ length: 10 }, (_, i) => ({
        ...snapshot.questions[1]!,
        id: `q${i}`,
        points: 100,
        tags: i < 4 ? ["Bab-1"] : ["bab-2"],
      })),
    };
    const pooled = { ...practice, questionPool: { size: 3 } };
    const a = planAttempt(bank, pooled, 7);
    expect(a.questionIds).toHaveLength(3);
    expect(a.maxScore).toBe(300);
    // Same seed, same draw; the drawn questions keep the authored order.
    expect(planAttempt(bank, pooled, 7)).toEqual(a);
    expect([...a.questionIds].sort((x, y) => Number(x.slice(1)) - Number(y.slice(1)))).toEqual(
      a.questionIds,
    );
    const draws = new Set(
      Array.from({ length: 30 }, (_, s) => planAttempt(bank, pooled, s).questionIds.join()),
    );
    expect(draws.size).toBeGreaterThan(5);

    const bab1 = { ...practice, questionPool: { size: 10, tags: ["bab-1"] } };
    expect(planAttempt(bank, bab1, 1).questionIds).toEqual(["q0", "q1", "q2", "q3"]);
  });

  it("strips the answer key from play questions", () => {
    const play = toPlayQuestion(snapshot.questions[0]!, 42, practice);
    expect(JSON.stringify(play)).not.toContain("correctIds");
    expect(JSON.stringify(play)).not.toContain("Sampai 2024");
    expect(play).toMatchObject({ id: mcId, type: "multiple_choice", points: 1000 });
  });

  it("grades valid answers and rejects malformed ones", () => {
    const mc = snapshot.questions[0]!;
    expect(gradeAnswer(mc, { selectedIds: ["a"] })).toMatchObject({ points: 1000, result: full });
    expect(gradeAnswer(mc, { selectedIds: ["b"] })).toMatchObject({ points: 0 });
    expect(gradeAnswer(mc, { selectedIds: "a" })).toBeNull();
    expect(gradeAnswer(mc, null)).toBeNull();
  });
});

describe("outcomeFor respects the policy", () => {
  const mc = snapshot.questions[0]!;
  const graded = { result: full, points: 1000 };
  const progress = { xp: 10, streak: 1, maxStreak: 1 };

  it("instant + reveal + gamification", () => {
    expect(outcomeFor(practice, mc, graded, progress, 0)).toMatchObject({
      result: full,
      points: 1000,
      reveal: { config: mc.config, explanation: "Sampai 2024." },
      progress,
      reaction: { message: "Mantap!" },
    });
  });

  it("no reveal, no gamification", () => {
    const quiet: Policy = { ...practice, showCorrectAnswer: false, gamification: false };
    const outcome = outcomeFor(quiet, mc, graded, progress);
    expect(outcome).toEqual({ result: full, points: 1000 });
  });

  it("feedback at the end or none → nothing now", () => {
    expect(outcomeFor({ ...practice, feedback: "end" }, mc, graded, progress)).toBeUndefined();
    expect(outcomeFor(DEFAULT_POLICIES.exam, mc, graded, progress)).toBeUndefined();
  });
});

describe("answeredState and summarize", () => {
  const responses = new Map<string, StoredResponse>([
    [mcId, { answer: { selectedIds: ["a"] }, result: full, points: 1000 }],
    [tfId, { answer: { value: false }, result: wrong, points: 0 }],
  ]);

  it("rebuilds per-question feedback with a running streak", () => {
    const { answered, progress } = answeredState(practice, snapshot.questions, responses);
    expect(Object.keys(answered)).toEqual([mcId, tfId]);
    expect(answered[mcId]?.outcome?.progress).toEqual({ xp: 10, streak: 1, maxStreak: 1 });
    expect(progress).toEqual({ xp: 10, streak: 0, maxStreak: 1 });
  });

  it("summarizes score, XP and a review list", () => {
    const summary = summarize({
      snapshot,
      questionIds: [mcId, tfId],
      seed: 1,
      policy: practice,
      responses,
      canRetry: true,
    });
    expect(summary).toMatchObject({
      score: 1000,
      maxScore: 1500,
      percent: 67,
      xp: 10,
      maxStreak: 1,
      correctCount: 1,
      questionCount: 2,
      canRetry: true,
    });
    expect(summary.review.map((r) => r.result?.ratio)).toEqual([1, 0]);
    expect(summary.review[0]?.reveal?.explanation).toBe("Sampai 2024.");
  });

  it("leaves out the answer key when the policy hides it", () => {
    const summary = summarize({
      snapshot,
      questionIds: [mcId, tfId],
      seed: 1,
      policy: { ...practice, showCorrectAnswer: false },
      responses,
      canRetry: false,
    });
    expect(JSON.stringify(summary)).not.toContain("correctIds");
  });
});

describe("local practice adapter (same engine as the server)", () => {
  it("runs join → start → answer → finish, and resumes open attempts", async () => {
    const adapter = createLocalPracticeAdapter(snapshot, practice);
    const joined = await adapter.join("  Budi ");
    if (!joined.ok) throw new Error("join failed");
    expect(joined.nickname).toBe("Budi");

    const started = await adapter.start(joined.token);
    if (!started.ok) throw new Error("start failed");
    const { attempt } = started;
    expect(attempt.questions.map((q) => q.id)).toEqual([mcId, tfId]);

    const first = await adapter.answer(
      joined.token,
      attempt.attemptId,
      mcId,
      { selectedIds: ["a"] },
      800,
    );
    expect(first).toMatchObject({
      ok: true,
      outcome: { points: 1000, reaction: { message: "Mantap!" } },
    });
    expect(
      await adapter.answer(joined.token, attempt.attemptId, mcId, { selectedIds: ["b"] }, 1),
    ).toEqual({
      ok: false,
      error: "already_answered",
    });

    const resumed = await adapter.start(joined.token);
    if (!resumed.ok) throw new Error("resume failed");
    expect(resumed.attempt.attemptId).toBe(attempt.attemptId);
    expect(Object.keys(resumed.attempt.answered)).toEqual([mcId]);

    await adapter.answer(joined.token, attempt.attemptId, tfId, { value: true }, 500);
    const finished = await adapter.finish(joined.token, attempt.attemptId);
    expect(finished).toMatchObject({ ok: true, summary: { score: 1500, percent: 100, xp: 22 } });

    // A reload after finishing only resumes — it must not silently open attempt #2.
    expect(await adapter.start(joined.token, { resumeOnly: true })).toEqual({
      ok: false,
      error: "no_open_attempt",
    });
    const again = await adapter.start(joined.token);
    expect(again).toMatchObject({ ok: true, attempt: { attemptNo: 2 } });
  });

  it("enforces attempt limits and rejects bad input", async () => {
    const adapter = createLocalPracticeAdapter(snapshot, { ...practice, attempts: 1 });
    expect(await adapter.join("B4ngs4t")).toEqual({ ok: false, error: "invalid" });
    const joined = await adapter.join("Siti");
    if (!joined.ok) throw new Error("join failed");
    const started = await adapter.start(joined.token);
    if (!started.ok) throw new Error("start failed");
    expect(
      await adapter.answer(joined.token, started.attempt.attemptId, mcId, { nope: 1 }, 1),
    ).toEqual({ ok: false, error: "invalid" });
    const done = await adapter.finish(joined.token, started.attempt.attemptId);
    expect(done).toMatchObject({ ok: true, summary: { canRetry: false } });
    expect(await adapter.start(joined.token)).toEqual({ ok: false, error: "attempt_limit" });
    expect(await adapter.start("not-a-token")).toEqual({ ok: false, error: "unauthorized" });
  });
});
