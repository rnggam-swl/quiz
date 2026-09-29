"use client";

import { Download, FileSpreadsheet, FileUp, LoaderCircle, TriangleAlert } from "lucide-react";
import { useRef, useState, type ChangeEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { toCsv } from "@/engine/exam/report";
import {
  parseCsv,
  questionsToRows,
  rowsToQuestions,
  templateRows,
  type SheetImport,
  type SheetRow,
} from "@/lib/question-sheet";

import { useEditorContext } from "./EditorContext";

// Impor & ekspor soal (P8-13, docs/04-question-types.md#impor--ekspor). Everything happens
// in the browser; the imported questions join the draft and autosave like any edit. The
// spreadsheet libraries load only when used.

const MAX_FILE_BYTES = 5 * 1024 * 1024;

function fileName(title: string, ext: string) {
  const base =
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "quiz";
  return `${base}.${ext}`;
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveXlsx(rows: SheetRow[], name: string) {
  const [{ default: writeXlsxFile }, { xlsxSheet }] = await Promise.all([
    import("write-excel-file/browser"),
    import("@/lib/question-sheet-xlsx"),
  ]);
  const { data, options } = xlsxSheet(rows);
  await writeXlsxFile(data, options).toFile(name);
}

async function readRows(file: File): Promise<SheetRow[]> {
  if (/\.(csv|tsv|txt)$/i.test(file.name) || file.type === "text/csv") {
    return parseCsv(await file.text());
  }
  const { readSheet } = await import("read-excel-file/browser");
  return (await readSheet(file)) as SheetRow[];
}

export function SheetMenu() {
  const { store } = useEditorContext();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<(SheetImport & { name: string }) | null>(null);

  async function exportAs(kind: "xlsx" | "csv") {
    const { quiz, questions } = store.getState();
    if (questions.length === 0) {
      toast.error("Belum ada soal untuk diekspor.");
      return;
    }
    const rows = questionsToRows(questions);
    setBusy(true);
    try {
      if (kind === "csv") {
        const csv = toCsv(rows as (string | number | null)[][]);
        download(new Blob([csv], { type: "text/csv;charset=utf-8" }), fileName(quiz.title, "csv"));
      } else {
        await saveXlsx(rows, fileName(quiz.title, "xlsx"));
      }
    } catch {
      toast.error("Ekspor gagal. Coba lagi.");
    } finally {
      setBusy(false);
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("File maksimal 5 MB.");
      return;
    }
    setBusy(true);
    try {
      setPreview({ ...rowsToQuestions(await readRows(file)), name: file.name });
    } catch {
      toast.error("File tidak bisa dibaca. Pakai .xlsx atau .csv dari template.");
    } finally {
      setBusy(false);
    }
  }

  function confirmImport() {
    if (!preview) return;
    store.getState().appendQuestions(preview.questions);
    toast.success(`${preview.questions.length} soal ditambahkan.`);
    setPreview(null);
  }

  return (
    <>
      <DropdownMenu>
        <Tooltip content="Impor & ekspor soal">
          <DropdownMenuTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              aria-label="Impor & ekspor soal"
              disabled={busy}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <FileSpreadsheet />}
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onSelect={() => input.current?.click()}>
            <FileUp /> Impor dari Excel / CSV…
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportAs("xlsx")}>
            <Download /> Ekspor ke Excel (.xlsx)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportAs("csv")}>
            <Download /> Ekspor ke CSV
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void saveXlsx(templateRows(), "template-soal.xlsx")}>
            <FileSpreadsheet /> Unduh template
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.tsv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={onFile}
        aria-label="Pilih file soal"
      />

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        {preview && (
          <DialogContent
            title="Impor soal"
            description={`Dari ${preview.name}. Soal ditambahkan di akhir quiz sebagai draf.`}
          >
            <p className="text-sm">
              <strong>{preview.questions.length}</strong> soal siap ditambahkan.
            </p>
            {preview.errors.length > 0 && (
              <div className="flex flex-col gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                <p className="flex items-center gap-2 font-medium">
                  <TriangleAlert className="size-4 shrink-0" aria-hidden />
                  {preview.errors.length} baris dilewati
                </p>
                <ul className="max-h-40 list-disc overflow-y-auto pl-5 text-xs">
                  {preview.errors.map((e) => (
                    <li key={`${e.row}-${e.message}`}>
                      Baris {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Batal</Button>
              </DialogClose>
              <Button onClick={confirmImport} disabled={preview.questions.length === 0}>
                Tambahkan {preview.questions.length} soal
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
