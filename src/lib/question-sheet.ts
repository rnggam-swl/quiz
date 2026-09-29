import { createId } from "@/lib/id";
import { DEFAULT_POINTS, TIME_LIMIT, type Question } from "@/questions/question";
import { parseNumberInput } from "@/questions/number/definition";
import {
  getDefinition,
  isQuestionType,
  QUESTION_TYPES,
  type QuestionType,
} from "@/questions/registry";
import { mediaSchema, type Item } from "@/questions/shared";

// Questions ↔ spreadsheet rows (P8-13, docs/04-question-types.md#impor--ekspor). One row per
// question. Simple types are plain columns a teacher can type in Excel or Google Sheets;
// anything the columns can't hold exactly (media on options, rubrics, matching, hotspot…)
// travels as JSON in the last column, so an export always imports back unchanged.

export const OPTION_COLUMNS = 6;

export const SHEET_HEADERS = [
  "Tipe",
  "Pertanyaan",
  ...Array.from({ length: OPTION_COLUMNS }, (_, i) => `Opsi ${i + 1}`),
  "Jawaban",
  "Waktu (detik)",
  "Poin",
  "Penjelasan",
  "Tag",
  "Data lanjutan (JSON)",
] as const;

/** Friendly names in the Tipe column (the internal keys work too). */
const TYPE_NAMES: Record<string, QuestionType> = {
  pilihan_ganda: "multiple_choice",
  benar_salah: "true_false",
  isian: "short_answer",
  isian_singkat: "short_answer",
  angka: "number",
  urutkan: "sequencing",
  urutan: "sequencing",
  odd_one_out: "odd_one_out",
  beda_sendiri: "odd_one_out",
  esai: "essay",
  menjodohkan: "matching",
  kelompokkan: "grouping",
  isi_titik: "word_blank",
  slider: "slider",
  hotspot: "hotspot",
  cerita_bercabang: "branching",
};

const SHEET_NAME: Partial<Record<QuestionType, string>> = {
  multiple_choice: "pilihan_ganda",
  true_false: "benar_salah",
  short_answer: "isian",
  number: "angka",
  sequencing: "urutkan",
  odd_one_out: "odd_one_out",
  essay: "esai",
};

export type SheetCell = string | number | boolean | Date | null | undefined;
export type SheetRow = SheetCell[];

// ─── Export ───────────────────────────────────────────────────────────────────

const plainItems = (items: Item[]) =>
  items.length <= OPTION_COLUMNS && items.every((i) => !i.media);
const numberText = (n: number) => String(n);

/** The Opsi/Jawaban columns for a question, or null when only JSON can hold it exactly. */
function simpleColumns(question: Question): { options: string[]; answer: string } | null {
  const config = question.config as Record<string, unknown>;
  switch (question.type) {
    case "multiple_choice": {
      const { options, correctIds, multiple } = config as {
        options: Item[];
        correctIds: string[];
        multiple: boolean;
      };
      // "Several answers" is read from how many are marked; one marked + multiple can't be.
      if (!plainItems(options) || (multiple && correctIds.length < 2)) return null;
      if (!multiple && correctIds.length > 1) return null;
      const answer = options
        .map((o, i) => (correctIds.includes(o.id) ? i + 1 : null))
        .filter((n) => n !== null)
        .join(",");
      return { options: options.map((o) => o.text), answer };
    }
    case "true_false":
      return { options: [], answer: (config as { correct: boolean }).correct ? "Benar" : "Salah" };
    case "short_answer": {
      const { accepted, caseSensitive, fuzzy } = config as {
        accepted: string[];
        caseSensitive: boolean;
        fuzzy: number;
      };
      if (caseSensitive || fuzzy !== 0 || accepted.some((a) => a.includes("|"))) return null;
      return { options: [], answer: accepted.join(" | ") };
    }
    case "number": {
      const { value, tolerance, unit } = config as {
        value: number;
        tolerance: number;
        unit?: string;
      };
      if (unit) return null;
      return {
        options: [],
        answer:
          tolerance > 0 ? `${numberText(value)} ± ${numberText(tolerance)}` : numberText(value),
      };
    }
    case "sequencing": {
      const { items, scoring } = config as { items: Item[]; scoring: string };
      if (!plainItems(items) || scoring !== "adjacent") return null;
      return { options: items.map((i) => i.text), answer: "" };
    }
    case "odd_one_out": {
      const { items, oddId, reason } = config as { items: Item[]; oddId: string; reason?: string };
      if (!plainItems(items) || reason?.trim()) return null;
      const odd = items.findIndex((i) => i.id === oddId);
      return { options: items.map((i) => i.text), answer: odd >= 0 ? String(odd + 1) : "" };
    }
    case "essay": {
      const { minWords, maxWords, rubric, guide } = config as {
        minWords: number | null;
        maxWords: number | null;
        rubric: { criterion: string }[];
        guide: string;
      };
      if (minWords !== null || maxWords !== null || rubric.some((r) => r.criterion.trim())) {
        return null;
      }
      return { options: [], answer: guide };
    }
    default:
      return null;
  }
}

export function questionsToRows(questions: Question[]): SheetRow[] {
  const rows: SheetRow[] = [[...SHEET_HEADERS]];
  for (const question of questions) {
    const simple = question.media.length === 0 ? simpleColumns(question) : null;
    const options = simple?.options ?? [];
    rows.push([
      SHEET_NAME[question.type] ?? question.type,
      question.prompt,
      ...Array.from({ length: OPTION_COLUMNS }, (_, i) => options[i] ?? ""),
      simple?.answer ?? "",
      question.timeLimitS ?? "",
      question.points,
      question.explanation,
      question.tags.join(", "),
      simple
        ? ""
        : JSON.stringify({ config: question.config, media: question.media, help: question.help }),
    ]);
  }
  return rows;
}

/** "Unduh template": the headers plus one example per simple type. */
export function templateRows(): SheetRow[] {
  const row = (
    type: string,
    prompt: string,
    options: string[],
    answer: string,
    extra: { time?: number; explanation?: string; tags?: string } = {},
  ): SheetRow => [
    type,
    prompt,
    ...Array.from({ length: OPTION_COLUMNS }, (_, i) => options[i] ?? ""),
    answer,
    extra.time ?? "",
    1000,
    extra.explanation ?? "",
    extra.tags ?? "",
    "",
  ];
  return [
    [...SHEET_HEADERS],
    row("pilihan_ganda", "Ibu kota Indonesia saat ini?", ["Jakarta", "Bandung", "Surabaya"], "1", {
      time: 20,
      explanation: "Jawaban: nomor opsi yang benar.",
      tags: "geografi",
    }),
    row("pilihan_ganda", "Mana yang bilangan prima?", ["2", "4", "5", "9"], "1,3", {
      explanation: "Lebih dari satu nomor = pilih semua yang benar.",
      tags: "matematika",
    }),
    row("benar_salah", "Paus termasuk ikan.", [], "Salah", { tags: "ipa" }),
    row("isian", "Siapa presiden pertama Indonesia?", [], "Soekarno | Sukarno", {
      explanation: "Pisahkan jawaban yang diterima dengan |",
    }),
    row("angka", "Berapa setengah dari 7?", [], "3,5", {
      explanation: "Toleransi opsional, misalnya 3,5 ± 0,1",
    }),
    row(
      "urutkan",
      "Urutkan daur hidup kupu-kupu.",
      ["Telur", "Ulat", "Kepompong", "Kupu-kupu"],
      "",
      {
        explanation: "Tulis opsi dalam urutan yang benar.",
      },
    ),
    row("odd_one_out", "Mana yang bukan hewan?", ["Kucing", "Paus", "Mawar", "Elang"], "3"),
    row("esai", "Jelaskan tiga penyebab banjir.", [], "Panduan penilaian untuk guru (opsional)."),
  ];
}

// ─── Import ───────────────────────────────────────────────────────────────────

export type SheetImport = {
  questions: Question[];
  errors: { row: number; message: string }[];
};

const MAX_ROWS = 500;

function text(cell: SheetCell): string {
  if (cell === null || cell === undefined) return "";
  if (cell instanceof Date) return cell.toISOString();
  let value = String(cell).trim();
  // Our own CSV export guards formula-like cells with a leading apostrophe.
  if (/^'[=+\-@]/.test(value)) value = value.slice(1);
  return value;
}

const normalize = (header: string) =>
  header
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function resolveType(raw: string): QuestionType | null {
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, "_")
    .replace(/_+/g, "_");
  if (isQuestionType(key)) return key;
  if (TYPE_NAMES[key]) return TYPE_NAMES[key]!;
  // Labels as shown in the editor ("Pilihan Ganda", "Benar / Salah").
  const squash = (label: string) => label.toLowerCase().replace(/[\s/]+/g, "");
  return QUESTION_TYPES.find((type) => squash(getDefinition(type).label) === squash(raw)) ?? null;
}

/** "1, 3" → [0, 2] (1-based in the sheet). */
function indexes(raw: string): number[] | null {
  if (!raw) return [];
  const parts = raw.split(/[,;\s]+/).filter(Boolean);
  const numbers = parts.map(Number);
  return numbers.every((n) => Number.isInteger(n) && n >= 1) ? numbers.map((n) => n - 1) : null;
}

type Built = { config: unknown } | { error: string };

function buildConfig(type: QuestionType, options: string[], answer: string): Built {
  const items = options.map((t) => ({ id: createId(), text: t }));
  switch (type) {
    case "multiple_choice": {
      const picked = indexes(answer);
      if (!picked)
        return { error: "Jawaban pilihan ganda berupa nomor opsi, misalnya 2 atau 1,3." };
      if (picked.some((i) => i >= items.length))
        return { error: "Nomor jawaban melebihi jumlah opsi." };
      return {
        config: {
          options: items,
          correctIds: [...new Set(picked)].map((i) => items[i]!.id),
          multiple: new Set(picked).size > 1,
        },
      };
    }
    case "true_false": {
      const value = answer.toLowerCase();
      if (["benar", "b", "true", "ya", "1"].includes(value)) return { config: { correct: true } };
      if (["salah", "s", "false", "tidak", "0"].includes(value))
        return { config: { correct: false } };
      return { error: "Jawaban benar/salah harus “Benar” atau “Salah”." };
    }
    case "short_answer": {
      const accepted = answer
        .split("|")
        .map((a) => a.trim())
        .filter(Boolean);
      return {
        config: { accepted: accepted.length ? accepted : [""], caseSensitive: false, fuzzy: 0 },
      };
    }
    case "number": {
      const match = /^(.+?)(?:\s*(?:±|\+\/-|\+-)\s*(.+))?$/.exec(answer);
      const value = match ? parseNumberInput(match[1]!) : null;
      const tolerance = match?.[2] ? parseNumberInput(match[2]) : 0;
      if (value === null || tolerance === null || tolerance < 0) {
        return { error: "Jawaban angka tidak valid. Contoh: 12,5 atau 12,5 ± 0,5." };
      }
      return { config: { value, tolerance } };
    }
    case "sequencing":
      return { config: { items, scoring: "adjacent" } };
    case "odd_one_out": {
      const picked = indexes(answer);
      if (!picked || picked.length > 1 || (picked.length === 1 && picked[0]! >= items.length)) {
        return { error: "Jawaban odd one out berupa satu nomor opsi." };
      }
      return { config: { items, oddId: picked.length ? items[picked[0]!]!.id : "" } };
    }
    case "essay":
      return { config: { minWords: null, maxWords: null, rubric: [], guide: answer } };
    default:
      return { error: "Tipe ini hanya bisa diimpor dengan kolom Data lanjutan (JSON)." };
  }
}

/** Rows (first one = headers) → questions, with a message per row that couldn't be read. */
export function rowsToQuestions(rows: SheetRow[]): SheetImport {
  const result: SheetImport = { questions: [], errors: [] };
  const [header, ...body] = rows;
  if (!header) return { ...result, errors: [{ row: 1, message: "File kosong." }] };

  const columns = header.map((h) => normalize(text(h)));
  const col = (name: string) => columns.indexOf(normalize(name));
  const typeCol = col("Tipe");
  const promptCol = col("Pertanyaan");
  if (typeCol < 0 || promptCol < 0) {
    return {
      ...result,
      errors: [
        { row: 1, message: "Baris pertama harus berisi judul kolom, minimal Tipe dan Pertanyaan." },
      ],
    };
  }
  const optionCols = columns.map((c, i) => (/^opsi \d+$/.test(c) ? i : -1)).filter((i) => i >= 0);
  const get = (row: SheetRow, name: string) => {
    const i = col(name);
    return i >= 0 ? text(row[i]) : "";
  };

  body.slice(0, MAX_ROWS).forEach((row, index) => {
    const line = index + 2;
    if (row.every((cell) => !text(cell))) return;
    const fail = (message: string) => result.errors.push({ row: line, message });

    const type = resolveType(text(row[typeCol]));
    if (!type) return fail(`Tipe “${text(row[typeCol])}” tidak dikenal.`);
    const definition = getDefinition(type);

    const prompt = text(row[promptCol]).slice(0, 2000);
    let config: unknown;
    let media: Question["media"] = [];
    let help = "";
    const json = get(row, "Data lanjutan (JSON)");
    if (json) {
      let data: { config?: unknown; media?: unknown; help?: unknown };
      try {
        data = JSON.parse(json) as typeof data;
      } catch {
        return fail("Kolom Data lanjutan bukan JSON yang valid.");
      }
      const parsed = definition.configSchema.safeParse(data.config);
      if (!parsed.success) return fail("Isi Data lanjutan tidak cocok dengan tipe soal.");
      config = parsed.data;
      const parsedMedia = mediaSchema.array().max(4).safeParse(data.media);
      if (parsedMedia.success) media = parsedMedia.data;
      if (typeof data.help === "string") help = data.help.slice(0, 1000);
    } else {
      const options = optionCols.map((i) => text(row[i])).filter(Boolean);
      const built = buildConfig(type, options, get(row, "Jawaban"));
      if ("error" in built) return fail(built.error);
      const parsed = definition.configSchema.safeParse(built.config);
      if (!parsed.success) return fail("Opsi atau jawaban terlalu panjang.");
      config = parsed.data;
    }

    const timeText = get(row, "Waktu (detik)");
    const time = timeText ? Number(timeText) : null;
    if (
      time !== null &&
      (!Number.isInteger(time) || time < TIME_LIMIT.min || time > TIME_LIMIT.max)
    ) {
      return fail(`Waktu harus ${TIME_LIMIT.min}–${TIME_LIMIT.max} detik.`);
    }
    const pointsText = get(row, "Poin");
    const points = pointsText ? Number(pointsText) : DEFAULT_POINTS;
    if (!Number.isInteger(points) || points < 0 || points > 10_000) {
      return fail("Poin harus bilangan bulat 0–10000.");
    }

    result.questions.push({
      id: crypto.randomUUID(),
      type,
      prompt,
      help,
      media,
      config,
      timeLimitS: time,
      points,
      explanation: get(row, "Penjelasan").slice(0, 2000),
      tags: [
        ...new Set(
          get(row, "Tag")
            .split(",")
            .map((t) => t.trim().toLowerCase().slice(0, 30))
            .filter(Boolean),
        ),
      ].slice(0, 10),
    });
  });
  if (body.length > MAX_ROWS) {
    result.errors.push({ row: MAX_ROWS + 2, message: `Maksimal ${MAX_ROWS} soal per impor.` });
  }
  return result;
}

// ─── CSV ──────────────────────────────────────────────────────────────────────

/** RFC 4180 reader. The delimiter (, ; or tab) is guessed from the header line. */
export function parseCsv(input: string): string[][] {
  const source = input.replace(/^﻿/, "");
  const firstLine = source.slice(0, source.search(/\r?\n|$/));
  const counts = [",", ";", "\t"].map((d) => [d, firstLine.split(d).length] as const);
  const delimiter = counts.reduce((a, b) => (b[1] > a[1] ? b : a))[0];

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"' && cell === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
