/** Roster CSV import (daftar peserta): "nama, NIS/email[, tambahan waktu %]" per line. */

export type RosterEntry = { name: string; identifier: string; extraTimePct: number };
export type RosterProblem = { line: number; message: string };

export const MAX_ROSTER = 500;

const HEADER = /^(nama|name)\b/i;

/** Split one line on the separator it most likely uses: tab, semicolon (Excel id-ID) or comma. */
function cells(line: string): string[] {
  const separator = line.includes("\t") ? "\t" : line.includes(";") ? ";" : ",";
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else quoted = !quoted;
    } else if (ch === separator && !quoted) {
      out.push(current);
      current = "";
    } else current += ch;
  }
  out.push(current);
  return out.map((c) => c.trim());
}

/**
 * Parse pasted or uploaded roster text. A header row is skipped; bad rows are reported
 * by line number instead of silently dropped, and duplicate identifiers are refused.
 */
export function parseRoster(text: string): { entries: RosterEntry[]; problems: RosterProblem[] } {
  const entries: RosterEntry[] = [];
  const problems: RosterProblem[] = [];
  const seen = new Map<string, number>();

  text.split(/\r?\n/).forEach((raw, index) => {
    const line = index + 1;
    if (!raw.trim()) return;
    const [name = "", identifier = "", extra = ""] = cells(raw);
    if (index === 0 && HEADER.test(name)) return;

    if (!name) return problems.push({ line, message: "Nama kosong." });
    if (name.length > 60) return problems.push({ line, message: "Nama lebih dari 60 karakter." });
    if (!identifier) return problems.push({ line, message: "NIS/email kosong." });
    if (identifier.length > 120) {
      return problems.push({ line, message: "NIS/email lebih dari 120 karakter." });
    }
    const pct = extra ? Number(extra.replace("%", "").replace(",", ".")) : 0;
    if (!Number.isInteger(pct) || pct < 0 || pct > 200) {
      return problems.push({ line, message: "Tambahan waktu harus 0–200 (persen)." });
    }
    const key = identifier.toLowerCase();
    const first = seen.get(key);
    if (first !== undefined) {
      return problems.push({ line, message: `NIS/email sama dengan baris ${first}.` });
    }
    seen.set(key, line);
    entries.push({ name, identifier, extraTimePct: pct });
  });

  if (entries.length > MAX_ROSTER) {
    problems.push({ line: 0, message: `Maksimal ${MAX_ROSTER} peserta per ujian.` });
  }
  return { entries: entries.slice(0, MAX_ROSTER), problems };
}
