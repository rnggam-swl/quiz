import { describe, expect, it } from "vitest";

import {
  changeQuestionType,
  createQuestion,
  duplicateQuestion,
  hasAuthoredContent,
  questionSchema,
  validateQuestion,
  validateQuiz,
  type Question,
} from "./question";
import { trueFalse } from "./true-false/definition";

function trueFalseQuestion(prompt: string): Question {
  return { ...createQuestion("true_false"), prompt };
}

describe("createQuestion", () => {
  it("builds a schema-valid question with the type's defaults", () => {
    const q = createQuestion("multiple_choice");
    expect(questionSchema.safeParse(q).success).toBe(true);
    expect(q.points).toBe(1000);
    expect(q.timeLimitS).toBeNull();
  });
});

describe("duplicateQuestion", () => {
  it("deep-copies with a new id", () => {
    const original = createQuestion("multiple_choice");
    const copy = duplicateQuestion(original);
    expect(copy.id).not.toBe(original.id);
    expect(copy.config).toEqual(original.config);
    expect(copy.config).not.toBe(original.config);
  });
});

describe("changeQuestionType", () => {
  it("keeps the envelope and resets the config", () => {
    const q = { ...createQuestion("multiple_choice"), prompt: "Ibu kota Indonesia?", points: 500 };
    const next = changeQuestionType(q, "true_false");
    expect(next).toMatchObject({ id: q.id, prompt: q.prompt, points: 500, type: "true_false" });
    expect(next.config).toEqual(trueFalse.defaults());
  });

  it("is a no-op for the same type", () => {
    const q = createQuestion("number");
    expect(changeQuestionType(q, "number")).toBe(q);
  });
});

describe("hasAuthoredContent", () => {
  it("ignores ids, empty strings and zero", () => {
    expect(hasAuthoredContent(createQuestion("multiple_choice").config)).toBe(false);
    expect(hasAuthoredContent(createQuestion("matching").config)).toBe(false);
    expect(hasAuthoredContent({ value: 0, tolerance: 0 })).toBe(false);
  });

  it("detects typed text and non-zero numbers", () => {
    expect(hasAuthoredContent({ options: [{ id: "x", text: "Jakarta" }] })).toBe(true);
    expect(hasAuthoredContent({ value: 42, tolerance: 0 })).toBe(true);
  });
});

describe("validateQuestion", () => {
  it("requires a prompt unless there is media", () => {
    expect(validateQuestion(trueFalseQuestion(""))).toEqual([
      { path: "prompt", message: "Pertanyaan belum diisi." },
    ]);
    const withImage = {
      ...trueFalseQuestion(""),
      media: [{ kind: "image" as const, url: "https://x/y.png" }],
    };
    expect(validateQuestion(withImage)).toEqual([]);
  });

  it("prefixes config issue paths", () => {
    const q = { ...createQuestion("short_answer"), prompt: "Proklamator?" };
    expect(validateQuestion(q)).toEqual([
      { path: "config.accepted", message: "Isi minimal satu jawaban yang diterima." },
    ]);
  });

  it("reports a corrupt config instead of throwing", () => {
    const q = { ...trueFalseQuestion("Bumi datar?"), config: { correct: "ya" } };
    expect(validateQuestion(q).map((i) => i.path)).toEqual(["config"]);
  });
});

describe("validateQuiz", () => {
  it("lists quiz-level problems then per-question ones with their number", () => {
    const issues = validateQuiz({ title: " " }, [trueFalseQuestion("OK?"), trueFalseQuestion("")]);
    expect(issues).toEqual([
      { path: "title", message: "Judul quiz belum diisi." },
      expect.objectContaining({
        message: "Soal #2: Pertanyaan belum diisi.",
        questionIndex: 1,
        path: "prompt",
      }),
    ]);
  });

  it("requires at least one question", () => {
    expect(validateQuiz({ title: "Kuis" }, []).map((i) => i.message)).toEqual([
      "Quiz belum punya soal.",
    ]);
  });
});
