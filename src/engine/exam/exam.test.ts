import { describe, expect, it } from "vitest";

import type { SnapshotQuestion } from "@/engine/practice/snapshot";

import { clockOffset, examDeadline, formatCountdown, remainingMs } from "./deadline";
import { describeIntegrity, integrityBatchSchema, summarizeIntegrity } from "./integrity";
import { canVisit, markOf, submitCheck, submitWarning } from "./navigation";
import { finalPercent, itemAnalysis, percentOf, toCsv } from "./report";
import { parseRoster } from "./roster";

const MIN = 60_000;

describe("examDeadline", () => {
  const startedAt = Date.UTC(2026, 8, 27, 8, 0);

  it("adds the duration, stretched by the accommodation", () => {
    expect(examDeadline({ startedAt, durationS: 3600, closesAt: null })).toBe(startedAt + 60 * MIN);
    expect(examDeadline({ startedAt, durationS: 3600, extraTimePct: 25, closesAt: null })).toBe(
      startedAt + 75 * MIN,
    );
  });

  it("never runs past closes_at, and falls back to it without a duration", () => {
    const closesAt = startedAt + 30 * MIN;
    expect(examDeadline({ startedAt, durationS: 3600, closesAt })).toBe(closesAt);
    expect(examDeadline({ startedAt, durationS: null, closesAt })).toBe(closesAt);
    expect(examDeadline({ startedAt, durationS: null, closesAt: null })).toBeNull();
  });
});

describe("countdown", () => {
  it("counts from the server's clock, whatever this device thinks the time is", () => {
    const clientNow = 1_000_000;
    // The device runs 2 minutes behind the server.
    const offset = clockOffset(new Date(clientNow + 2 * MIN).toISOString(), clientNow);
    expect(offset).toBe(2 * MIN);
    const deadline = new Date(clientNow + 12 * MIN).toISOString();
    expect(remainingMs(deadline, offset, clientNow)).toBe(10 * MIN);
    expect(remainingMs(deadline, offset, clientNow + 20 * MIN)).toBe(0);
  });

  it("formats minutes and hours", () => {
    expect(formatCountdown(7_000)).toBe("0:07");
    expect(formatCountdown(12 * MIN + 3_000)).toBe("12:03");
    expect(formatCountdown(65 * MIN + 9_000)).toBe("1:05:09");
    expect(formatCountdown(500)).toBe("0:01"); // rounds up: never shows 0:00 early
  });
});

describe("parseRoster", () => {
  it("reads comma, semicolon and tab separated rows and skips a header", () => {
    const { entries, problems } = parseRoster(
      'Nama;NIS;Tambahan waktu\nAni Wijaya;1001;\n"Santoso, Budi",budi@sekolah.id,25%\nCitra\t1003\t0',
    );
    expect(problems).toEqual([]);
    expect(entries).toEqual([
      { name: "Ani Wijaya", identifier: "1001", extraTimePct: 0 },
      { name: "Santoso, Budi", identifier: "budi@sekolah.id", extraTimePct: 25 },
      { name: "Citra", identifier: "1003", extraTimePct: 0 },
    ]);
  });

  it("reports bad rows by line and refuses duplicate identifiers", () => {
    const { entries, problems } = parseRoster("Ani,1001\n,1002\nBudi,\nCici,1001\nDodi,1004,abc");
    expect(entries.map((e) => e.name)).toEqual(["Ani"]);
    expect(problems).toEqual([
      { line: 2, message: "Nama kosong." },
      { line: 3, message: "NIS/email kosong." },
      { line: 4, message: "NIS/email sama dengan baris 1." },
      { line: 5, message: "Tambahan waktu harus 0–200 (persen)." },
    ]);
  });
});

describe("integrity", () => {
  it("validates batches from the browser", () => {
    const at = new Date().toISOString();
    expect(integrityBatchSchema.safeParse([{ kind: "paste", at }]).success).toBe(true);
    expect(integrityBatchSchema.safeParse([{ kind: "hack", at }]).success).toBe(false);
    expect(
      integrityBatchSchema.safeParse([{ kind: "copy", at, meta: { durationMs: 5, extra: 1 } }])
        .success,
    ).toBe(false);
    expect(
      integrityBatchSchema.safeParse(Array.from({ length: 51 }, () => ({ kind: "copy", at })))
        .success,
    ).toBe(false);
  });

  it("summarizes events for the teacher", () => {
    const summary = summarizeIntegrity([
      { kind: "tab_hidden", meta: { durationMs: 50_000 } },
      { kind: "paste" },
      { kind: "tab_hidden", meta: { durationMs: 30_000 } },
      { kind: "tab_hidden", meta: null },
      { kind: "tab_hidden" },
      { kind: "nonsense" },
    ]);
    expect(describeIntegrity(summary)).toBe("Pindah tab 4× (1m 20d) · Menempel 1×");
    expect(describeIntegrity(summarizeIntegrity([]))).toBe("");
  });
});

describe("navigation", () => {
  it("marks doubts over answers", () => {
    expect(markOf(true, true)).toBe("flagged");
    expect(markOf(true, false)).toBe("answered");
    expect(markOf(false, false)).toBe("empty");
  });

  it("only moves forward in forward-only exams", () => {
    expect(canVisit("free", 5, 1, 10)).toBe(true);
    expect(canVisit("forward", 5, 4, 10)).toBe(false);
    expect(canVisit("forward", 5, 6, 10)).toBe(true);
    expect(canVisit("forward", 5, 8, 10)).toBe(false);
    expect(canVisit("free", 5, 10, 10)).toBe(false);
  });

  it("warns about unanswered and flagged questions before submitting", () => {
    const check = submitCheck(["answered", "empty", "flagged", "empty", "flagged"]);
    expect(submitWarning(check)).toBe("2 soal belum dijawab, 2 ditandai ragu-ragu.");
    expect(submitWarning(submitCheck(["answered"]))).toBeNull();
  });
});

describe("report", () => {
  it("picks the attempt that counts", () => {
    const attempts = [
      { participantId: "a", attemptNo: 1, status: "submitted" as const, percent: 80 },
      { participantId: "a", attemptNo: 2, status: "expired" as const, percent: 60 },
      { participantId: "a", attemptNo: 3, status: "in_progress" as const, percent: null },
      { participantId: "b", attemptNo: 1, status: "in_progress" as const, percent: null },
    ];
    expect(finalPercent(attempts, "highest").get("a")).toBe(80);
    expect(finalPercent(attempts, "last").get("a")).toBe(60);
    expect(finalPercent(attempts, "average").get("a")).toBe(70);
    expect(finalPercent(attempts, "highest").get("b")).toBeNull();
    expect(percentOf(750, 1000)).toBe(75);
    expect(percentOf(null, 1000)).toBeNull();
  });

  it("analyses items, counts options and flags suspiciously hard questions", () => {
    const mc: SnapshotQuestion = {
      id: "mc",
      type: "multiple_choice",
      prompt: "Ibu kota?",
      help: "",
      media: [],
      config: {
        options: [
          { id: "a", text: "Jakarta" },
          { id: "b", text: "Bandung" },
        ],
        correctIds: ["a"],
        multiple: false,
      },
      points: 100,
      explanation: "",
      timeLimitS: null,
      tags: [],
    };
    const essayQ: SnapshotQuestion = { ...mc, id: "es", type: "essay", config: {} };
    const pick = (id: string, correct: number) => ({
      questionId: "mc",
      answer: { selectedIds: [id] },
      correct,
      total: 1,
      timeMs: 4000,
    });
    const [mcStat, essayStat] = itemAnalysis(
      [mc, essayQ],
      [
        pick("b", 0),
        pick("b", 0),
        pick("b", 0),
        pick("a", 1),
        { questionId: "es", answer: { text: "…" }, correct: null, total: null, timeMs: null },
      ],
    );
    expect(mcStat).toMatchObject({
      answered: 4,
      percentCorrect: 25,
      avgTimeMs: 4000,
      flagged: true,
    });
    expect(mcStat!.options).toEqual([
      { label: "Jakarta", correct: true, count: 1 },
      { label: "Bandung", correct: false, count: 3 },
    ]);
    expect(essayStat).toMatchObject({
      answered: 1,
      pending: 1,
      percentCorrect: null,
      flagged: false,
    });
  });

  it("writes Excel-friendly CSV and defuses formulas", () => {
    const csv = toCsv([
      ["Nama", "Nilai"],
      ['=HYPERLINK("x")', 80],
      ["Budi, S.Pd", null],
    ]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toBe('﻿Nama,Nilai\r\n"\'=HYPERLINK(""x"")",80\r\n"Budi, S.Pd",\r\n');
  });
});
