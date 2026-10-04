import { describe, expect, it } from "vitest";

import {
  toDraftQuestions,
  userPrompt,
  type AiRequest,
  type GeneratedQuestion,
} from "./ai-questions";

const blank: Omit<GeneratedQuestion, "type" | "prompt"> = {
  options: [],
  correct_options: [],
  is_true: false,
  accepted_answers: [],
  number_answer: 0,
  number_tolerance: 0,
  explanation: "Karena begitu.",
};

const g = (q: Partial<GeneratedQuestion> & Pick<GeneratedQuestion, "type">): GeneratedQuestion => ({
  ...blank,
  prompt: `Soal ${q.type}`,
  ...q,
});

describe("toDraftQuestions", () => {
  it("turns every supported type into a publishable draft", () => {
    const { questions, dropped } = toDraftQuestions({
      questions: [
        g({
          type: "multiple_choice",
          options: ["Jakarta", "Bandung", "Medan"],
          correct_options: [1],
        }),
        g({ type: "multiple_choice", options: ["2", "4", "5"], correct_options: [1, 3] }),
        g({ type: "true_false", is_true: true }),
        g({ type: "short_answer", accepted_answers: ["Soekarno", " Sukarno "] }),
        g({ type: "number", number_answer: 3.5, number_tolerance: 0.1 }),
        g({ type: "sequencing", options: ["Telur", "Ulat", "Kepompong", "Kupu-kupu"] }),
        g({
          type: "odd_one_out",
          options: ["Kucing", "Paus", "Mawar", "Elang"],
          correct_options: [3],
        }),
      ],
    });
    expect(dropped).toBe(0);
    expect(questions.map((q) => q.type)).toEqual([
      "multiple_choice",
      "multiple_choice",
      "true_false",
      "short_answer",
      "number",
      "sequencing",
      "odd_one_out",
    ]);
    const [single, multi, tf, short, num, , odd] = questions as {
      config: Record<string, unknown>;
      explanation: string;
    }[];
    const opts = (c: Record<string, unknown>, key = "options") =>
      c[key] as { id: string; text: string }[];
    expect(single!.config.correctIds).toEqual([opts(single!.config)[0]!.id]);
    expect(single!.config.multiple).toBe(false);
    expect(multi!.config.multiple).toBe(true);
    expect(tf!.config).toEqual({ correct: true });
    expect(short!.config).toEqual({
      accepted: ["Soekarno", "Sukarno"],
      caseSensitive: false,
      fuzzy: 1,
    });
    expect(num!.config).toEqual({ value: 3.5, tolerance: 0.1 });
    expect(odd!.config.oddId).toBe(opts(odd!.config, "items")[2]!.id);
    expect(single!.explanation).toBe("Karena begitu.");
  });

  it("drops what the teacher couldn't publish, and types they didn't ask for", () => {
    const { questions, dropped } = toDraftQuestions(
      {
        questions: [
          g({ type: "multiple_choice", options: ["A", "B"], correct_options: [] }), // no answer
          g({ type: "multiple_choice", options: ["A", "B"], correct_options: [7] }), // out of range
          g({ type: "odd_one_out", options: ["A", "B"], correct_options: [1] }), // too few
          g({ type: "short_answer", accepted_answers: [] }),
          g({ type: "true_false", prompt: "  " }),
          g({ type: "number", number_answer: 1 }), // not allowed below
          g({ type: "true_false", is_true: false }),
        ],
      },
      ["multiple_choice", "odd_one_out", "short_answer", "true_false"],
    );
    expect(questions).toHaveLength(1);
    expect(dropped).toBe(6);
  });
});

describe("userPrompt", () => {
  const base: AiRequest = {
    source: "topic",
    topic: "Daur air",
    text: "",
    count: 5,
    types: ["multiple_choice", "true_false"],
    level: "Kelas 5 SD",
  };

  it("asks for the count, level, topic and allowed types", () => {
    const prompt = userPrompt(base);
    expect(prompt).toContain("Buat 5 soal");
    expect(prompt).toContain("Kelas 5 SD");
    expect(prompt).toContain("Topik: Daur air");
    expect(prompt).toContain("multiple_choice");
    expect(prompt).not.toContain("short_answer");
  });

  it("wraps pasted material as data, and points at the PDF", () => {
    const text = userPrompt({ ...base, source: "text", text: "Air menguap…", topic: "" });
    expect(text).toContain("<bahan>\nAir menguap…\n</bahan>");
    expect(userPrompt({ ...base, source: "pdf", topic: "bab 2" })).toContain("dokumen PDF");
    expect(userPrompt({ ...base, level: " " })).toContain("tingkat: umum");
  });
});
