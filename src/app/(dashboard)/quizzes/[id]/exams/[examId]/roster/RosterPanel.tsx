"use client";

import { FileUp, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import type { RosterProblem } from "@/engine/exam/roster";

import {
  importRosterAction,
  removeRosterEntryAction,
} from "@/app/(dashboard)/quizzes/exam-actions";

type Entry = {
  id: string;
  name: string;
  identifier: string;
  extraTimePct: number;
  joined: boolean;
};

const MAX_FILE_BYTES = 200_000;

/** Import the participant list (P4-06) and remove entries. */
export function RosterPanel({ examId, entries }: { examId: string; entries: Entry[] }) {
  const [text, setText] = useState("");
  const [problems, setProblems] = useState<RosterProblem[]>([]);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFile(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File terlalu besar (maks. 200 KB).");
      return;
    }
    setText(await file.text());
  }

  function importText() {
    startTransition(async () => {
      const result = await importRosterAction(examId, text).catch(() => null);
      if (!result) return void toast.error("Koneksi bermasalah. Coba lagi.");
      if (!result.ok) return void toast.error(result.error);
      setProblems(result.problems);
      if (result.problems.length === 0) setText("");
      const parts = [`${result.added} peserta ditambahkan`];
      if (result.skipped) parts.push(`${result.skipped} sudah ada`);
      if (result.problems.length) parts.push(`${result.problems.length} baris bermasalah`);
      toast.success(`${parts.join(", ")}.`);
    });
  }

  function remove(entry: Entry) {
    startTransition(async () => {
      const result = await removeRosterEntryAction(examId, entry.id).catch(() => null);
      if (result?.ok) toast(`${entry.name} dihapus dari daftar.`);
      else toast.error("Gagal menghapus.");
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-col gap-1">
          <Label htmlFor="roster-text">Tempel atau unggah daftar</Label>
          <p className="text-xs text-fg-muted">
            Satu peserta per baris: <code>nama, NIS/email, tambahan waktu %</code>. Kolom ketiga
            opsional (mis. 25 untuk +25% waktu). Bisa langsung dari Excel (CSV atau salin sel).
          </p>
        </div>
        <Textarea
          id="roster-text"
          rows={8}
          value={text}
          placeholder={"Ani Wijaya, 1001\nBudi Santoso, 1002, 25"}
          onChange={(e) => setText(e.target.value)}
          className="font-mono text-xs"
        />
        {problems.length > 0 && (
          <ul
            role="alert"
            className="flex flex-col gap-1 rounded-xl bg-danger-soft p-3 text-xs text-danger"
          >
            {problems.slice(0, 20).map((p) => (
              <li key={`${p.line}-${p.message}`}>
                Baris {p.line}: {p.message}
              </li>
            ))}
            {problems.length > 20 && <li>…dan {problems.length - 20} lainnya.</li>}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt,text/csv,text/plain"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              void readFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" onClick={() => fileRef.current?.click()}>
            <FileUp /> Pilih file CSV
          </Button>
          <Button onClick={importText} disabled={pending || !text.trim()}>
            {pending && <LoaderCircle className="animate-spin" />} Impor
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="font-semibold">
          {entries.length} peserta terdaftar
          <span className="ml-2 text-sm font-normal text-fg-subtle">
            {entries.filter((e) => e.joined).length} sudah masuk
          </span>
        </h2>
        {entries.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line-strong p-8 text-center text-sm text-fg-muted">
            Belum ada peserta. Hanya NIS/email di daftar ini yang bisa masuk ujian.
          </p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{entry.name}</span>
                  <span className="truncate text-xs text-fg-subtle">
                    {entry.identifier}
                    {entry.extraTimePct > 0 && ` · +${entry.extraTimePct}% waktu`}
                    {entry.joined && " · sudah masuk"}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Hapus ${entry.name}`}
                  disabled={pending || entry.joined}
                  title={
                    entry.joined ? "Sudah masuk ujian; reset percobaannya di Monitor." : undefined
                  }
                  onClick={() => remove(entry)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
