import { describe, expect, it } from "vitest";

import { toCsv } from "@/engine/exam/report";
import { createQuestion, validateQuestion, type Question } from "@/questions/question";
import { QUESTION_TYPES } from "@/questions/registry";

import {
  parseCsv,
  questionsToRows,
  rowsToQuestions,
  SHEET_HEADERS,
  templateRows,
  type SheetRow,
} from "./question-sheet";

const item = (id: string, text: string) => ({ id, text });

function q(type: Question["type"], config: unknown, extra: Partial<Question> = {}): Question {
  return { ...createQuestion(type), prompt: `Soal ${type}`, config, ...extra };
}

/** A question without ids, for comparing an import with what was exported. */
function shape(question: Question) {
  const strip = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(strip);
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([k]) => k !== "id")
          .map(([k, v]) => [k, k.endsWith("Ids") || k === "oddId" ? "<ids>" : strip(v)]),
      );
    }
    return value;
  };
  return strip({ ...question, id: undefined });
}

const simple: Question[] = [
  q(
    "multiple_choice",
    { options: [item("a", "Jakarta"), item("b", "Bandung")], correctIds: ["a"], multiple: false },
    { timeLimitS: 20, points: 500, explanation: "Sejak 1945.", tags: ["geografi", "kelas 4"] },
  ),
  q("multiple_choice", {
    options: [item("a", "2"), item("b", "3"), item("c", "4")],
    correctIds: ["a", "b"],
    multiple: true,
  }),
  q("true_false", { correct: false }),
  q("short_answer", { accepted: ["Soekarno", "Sukarno"], caseSensitive: false, fuzzy: 0 }),
  q("number", { value: 12.5, tolerance: 0.5 }),
  q("sequencing", {
    items: [item("a", "Telur"), item("b", "Ulat"), item("c", "Kupu-kupu")],
    scoring: "adjacent",
  }),
  q("odd_one_out", {
    items: [item("a", "Kucing"), item("b", "Paus"), item("c", "Mawar")],
    oddId: "c",
  }),
  q("essay", { minWords: null, maxWords: null, rubric: [], guide: "Sebut 3 sebab." }),
];

describe("questionsToRows / rowsToQuestions", () => {
  it("round-trips simple questions through plain columns", () => {
    const rows = questionsToRows(simple);
    expect(rows[0]).toEqual([...SHEET_HEADERS]);
    expect(rows.slice(1).every((r) => r.at(-1) === "")).toBe(true); // no JSON needed
    expect(rows[1]!.slice(0, 2)).toEqual(["pilihan_ganda", "Soal multiple_choice"]);
    expect(rows[2]![8]).toBe("1,2");
    expect(rows[5]![8]).toBe("12.5 ± 0.5");

    const { questions, errors } = rowsToQuestions(rows);
    expect(errors).toEqual([]);
    expect(questions.map(shape)).toEqual(simple.map(shape));
    // Correct answers point at the new ids.
    const [mc] = questions as [
      Question & { config: { options: { id: string }[]; correctIds: string[] } },
    ];
    expect(mc.config.correctIds).toEqual([mc.config.options[0]!.id]);
  });

  it("round-trips every other type exactly through the JSON column", () => {
    const others = QUESTION_TYPES.map((type) => ({
      ...createQuestion(type),
      prompt: `Soal ${type}`,
      help: "Petunjuk",
      media: [
        {
          kind: "image" as const,
          url: "https://x.supabase.co/storage/v1/object/public/quiz-media/a/b/c.png",
        },
      ],
    }));
    const rows = questionsToRows(others);
    expect(rows.slice(1).every((r) => String(r.at(-1)).startsWith("{"))).toBe(true);
    const { questions, errors } = rowsToQuestions(rows);
    expect(errors).toEqual([]);
    expect(questions.map((x) => ({ ...x, id: "" }))).toEqual(others.map((x) => ({ ...x, id: "" })));
  });

  it("keeps lossless cases in JSON (one answer marked on a many-answers question)", () => {
    const tricky = q("multiple_choice", {
      options: [item("a", "A"), item("b", "B")],
      correctIds: ["a"],
      multiple: true,
    });
    const [, row] = questionsToRows([tricky]);
    expect(row!.at(-1)).toContain('"multiple":true');
    expect(rowsToQuestions(questionsToRows([tricky])).questions[0]!.config).toEqual(tricky.config);
  });

  it("reads what a teacher typed, with friendly type names and loose headers", () => {
    const rows: SheetRow[] = [
      ["tipe", "pertanyaan", "opsi 1", "opsi 2", "opsi 3", "jawaban", "poin", "tag"],
      [
        "Pilihan Ganda",
        "Ibu kota?",
        "Jakarta",
        "Bandung",
        "",
        1,
        500,
        "geografi, kelas 4, geografi",
      ],
      ["Benar / Salah", "Paus itu ikan.", "", "", "", "salah", "", ""],
      ["angka", "Setengah dari 7?", "", "", "", "3,5", "", ""],
      ["isian", "Presiden pertama?", "", "", "", "Soekarno | Sukarno", "", ""],
      ["", "", "", "", "", "", "", ""],
    ];
    const { questions, errors } = rowsToQuestions(rows);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(4);
    expect(questions[0]).toMatchObject({
      type: "multiple_choice",
      points: 500,
      tags: ["geografi", "kelas 4"],
      timeLimitS: null,
    });
    expect(questions[1]!.config).toEqual({ correct: false });
    expect(questions[2]!.config).toEqual({ value: 3.5, tolerance: 0 });
    expect((questions[3]!.config as { accepted: string[] }).accepted).toEqual([
      "Soekarno",
      "Sukarno",
    ]);
    for (const question of questions) expect(validateQuestion(question)).toEqual([]);
  });

  it("reports rows it can't read, with the spreadsheet row number", () => {
    const rows: SheetRow[] = [
      [
        "Tipe",
        "Pertanyaan",
        "Opsi 1",
        "Opsi 2",
        "Jawaban",
        "Waktu (detik)",
        "Data lanjutan (JSON)",
      ],
      ["teka-teki", "?", "", "", "", "", ""],
      ["benar_salah", "?", "", "", "mungkin", "", ""],
      ["pilihan_ganda", "?", "A", "B", "3", "", ""],
      ["pilihan_ganda", "?", "A", "B", "1", "2", ""],
      ["hotspot", "?", "", "", "", "", ""],
      ["hotspot", "?", "", "", "", "", "{rusak"],
      ["benar_salah", "Oke", "", "", "benar", "", ""],
    ];
    const { questions, errors } = rowsToQuestions(rows);
    expect(questions).toHaveLength(1);
    expect(errors.map((e) => e.row)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(errors[0]!.message).toContain("teka-teki");
  });

  it("ships a template whose examples import as publishable questions", () => {
    const { questions, errors } = rowsToQuestions(templateRows());
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(8);
    for (const question of questions) expect(validateQuestion(question)).toEqual([]);
  });

  it("needs the header row", () => {
    expect(rowsToQuestions([["Soal", "Jawaban"]]).errors[0]!.message).toContain("Tipe");
    expect(rowsToQuestions([]).errors).toHaveLength(1);
  });
});

describe("CSV", () => {
  it("round-trips through the export CSV (quotes, newlines, formula guard)", () => {
    const tricky = q(
      "short_answer",
      {
        accepted: ["-5"],
        caseSensitive: false,
        fuzzy: 0,
      },
      { prompt: 'Hasil "3 - 8",\nberapa?' },
    );
    const csv = toCsv(questionsToRows([tricky]) as (string | number | null)[][]);
    const { questions, errors } = rowsToQuestions(parseCsv(csv));
    expect(errors).toEqual([]);
    expect(questions[0]!.prompt).toBe('Hasil "3 - 8",\nberapa?');
    expect((questions[0]!.config as { accepted: string[] }).accepted).toEqual(["-5"]);
  });

  it("detects semicolons (Excel in Indonesian) and tabs", () => {
    expect(parseCsv('Tipe;Pertanyaan\r\nbenar_salah;"a;b"\r\n')).toEqual([
      ["Tipe", "Pertanyaan"],
      ["benar_salah", "a;b"],
    ]);
    expect(parseCsv("Tipe\tPertanyaan\nisian\tx")).toEqual([
      ["Tipe", "Pertanyaan"],
      ["isian", "x"],
    ]);
  });
});
