import { readSheet } from "read-excel-file/node";
import { describe, expect, it } from "vitest";
import writeXlsxFile from "write-excel-file/node";

import { createQuestion } from "@/questions/question";
import { QUESTION_TYPES } from "@/questions/registry";

import { questionsToRows, rowsToQuestions, templateRows, type SheetRow } from "./question-sheet";
import { xlsxSheet } from "./question-sheet-xlsx";

// The real .xlsx round trip (same libraries as the browser, Node builds).
async function throughXlsx(rows: SheetRow[]): Promise<SheetRow[]> {
  const { data, options } = xlsxSheet(rows);
  const buffer = await writeXlsxFile(data, options).toBuffer();
  return (await readSheet(buffer)) as SheetRow[];
}

describe("xlsx", () => {
  it("imports the template back without errors", async () => {
    const { questions, errors } = rowsToQuestions(await throughXlsx(templateRows()));
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(8);
  });

  it("round-trips every question type", async () => {
    const questions = QUESTION_TYPES.map((type) => ({
      ...createQuestion(type),
      prompt: `Soal ${type}: "kutip", koma, baris\nbaru`,
      timeLimitS: 30,
      points: 750,
      tags: ["a", "b"],
    }));
    const imported = rowsToQuestions(await throughXlsx(questionsToRows(questions)));
    expect(imported.errors).toEqual([]);
    expect(imported.questions.map((q) => ({ ...q, id: "", config: null }))).toEqual(
      questions.map((q) => ({ ...q, id: "", config: null })),
    );
  });
});
