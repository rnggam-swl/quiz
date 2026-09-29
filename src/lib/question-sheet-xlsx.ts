import type { SheetData, SheetOptions } from "write-excel-file/browser";

import { SHEET_HEADERS, type SheetRow } from "./question-sheet";

/** Rows → write-excel-file input: bold header, frozen first row, wrapped text. */
export function xlsxSheet(rows: SheetRow[]): {
  data: SheetData;
  options: SheetOptions<never>;
} {
  const [header = [], ...body] = rows;
  return {
    data: [
      header.map((value) => ({ value: String(value), fontWeight: "bold" as const })),
      ...body.map((row) =>
        row.map((value) =>
          value === "" || value === null || value === undefined
            ? null
            : typeof value === "number"
              ? { value, type: Number }
              : { value: String(value), type: String, wrap: true },
        ),
      ),
    ],
    options: {
      sheet: "Soal",
      stickyRowsCount: 1,
      columns: SHEET_HEADERS.map((h) => ({
        width: h === "Pertanyaan" ? 50 : h.startsWith("Data") ? 30 : h.startsWith("Opsi") ? 18 : 14,
      })),
    },
  };
}
