import { describe, expect, it, vi } from "vitest";

import { createQuestion } from "@/questions/question";

import { checkDraft, isOwnMediaUrl, makeSlug, rowToQuestion, toDraftPayload } from "./quiz-data";

const SUPABASE = "http://127.0.0.1:54321";
const own = `${SUPABASE}/storage/v1/object/public/quiz-media/u1/q1/a.png`;

describe("isOwnMediaUrl", () => {
  it("accepts files in our public bucket only", () => {
    expect(isOwnMediaUrl(own, SUPABASE)).toBe(true);
    expect(isOwnMediaUrl(own, `${SUPABASE}/`)).toBe(true);
    expect(isOwnMediaUrl("https://evil.example/pixel.gif", SUPABASE)).toBe(false);
    expect(isOwnMediaUrl(`${SUPABASE}/storage/v1/object/public/other/a.png`, SUPABASE)).toBe(false);
    expect(isOwnMediaUrl(`${SUPABASE}/storage/v1/object/public/quiz-media/../x`, SUPABASE)).toBe(
      false,
    );
  });
});

describe("checkDraft", () => {
  const base = {
    quizId: crypto.randomUUID(),
    baseRevision: 0,
    quiz: { title: "Kuis", description: "", coverUrl: null, theme: {} },
  };

  it("passes a clean draft", () => {
    const q = { ...createQuestion("true_false"), media: [{ kind: "image" as const, url: own }] };
    expect(checkDraft({ ...base, questions: [q] }, SUPABASE)).toEqual([]);
  });

  it("flags configs that don't match their type, foreign media and duplicate ids", () => {
    const bad = { ...createQuestion("true_false"), config: { correct: "yes" } };
    const hotlinked = {
      ...createQuestion("number"),
      media: [{ kind: "image" as const, url: "https://evil.example/x.png" }],
    };
    const dup = { ...hotlinked, media: [] };
    const problems = checkDraft({ ...base, questions: [bad, hotlinked, dup] }, SUPABASE);
    expect(problems.map((p) => p.message)).toEqual([
      "Isi soal tidak valid.",
      "Media harus diunggah lewat editor.",
      "Id soal ganda.",
    ]);
  });

  it("flags a hotlinked cover", () => {
    const problems = checkDraft(
      { ...base, quiz: { ...base.quiz, coverUrl: "https://x.test/c.jpg" }, questions: [] },
      SUPABASE,
    );
    expect(problems).toEqual([{ message: "Sampul harus diunggah lewat editor." }]);
  });
});

describe("rowToQuestion / toDraftPayload", () => {
  it("round-trips a question through the DB shape", () => {
    const q = {
      ...createQuestion("multiple_choice"),
      prompt: "Halo?",
      timeLimitS: 20,
      tags: ["ipa"],
    };
    const [row] = toDraftPayload([q]) as Record<string, unknown>[];
    expect(row).toMatchObject({ id: q.id, time_limit_s: 20, tags: ["ipa"] });
    expect(rowToQuestion(row as never)).toEqual(q);
  });

  it("drops rows with an unknown type and cleans malformed media", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const row = {
      id: crypto.randomUUID(),
      type: "essay",
      prompt: "",
      help: "",
      media: [],
      config: {},
      time_limit_s: null,
      points: 1000,
      explanation: "",
      tags: [],
    };
    expect(rowToQuestion(row)).toBeNull();
    expect(rowToQuestion({ ...row, type: "true_false", media: "nope" })?.media).toEqual([]);
    warn.mockRestore();
  });
});

describe("makeSlug", () => {
  it("builds lowercase, ascii, dash-separated slugs with a suffix", () => {
    expect(makeSlug("Kuis IPA Kelas 8!", "X7K2")).toBe("kuis-ipa-kelas-8-x7k2");
    expect(makeSlug("  Café & Crème  ", "a1")).toBe("cafe-creme-a1");
    expect(makeSlug("", "a1")).toBe("quiz-a1");
    expect(makeSlug("!!!", "a1")).toBe("quiz-a1");
  });

  it("matches the DB slug check and stays short", () => {
    const slug = makeSlug("a".repeat(200), "zz9");
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(slug.length).toBeLessThanOrEqual(54);
  });
});
