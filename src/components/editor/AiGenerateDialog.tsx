"use client";

import { LoaderCircle, Sparkles, TriangleAlert } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { AI_LIMITS, AI_TYPE_LABELS, AI_TYPES, type AiType } from "@/lib/ai-questions";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";
import type { Question } from "@/questions/question";
import { questionDefinitions } from "@/questions/registry";
import type { Item } from "@/questions/shared";

import { useEditorContext } from "./EditorContext";
import type { AiResult } from "./types";

// "Buat dengan AI" (P8-10, docs/04-question-types.md#generate-soal-dengan-ai): the model
// drafts questions, the teacher reviews them here and in the editor before publishing.

type Source = "topic" | "text" | "pdf";

const SOURCES: { value: Source; label: string }[] = [
  { value: "topic", label: "Topik" },
  { value: "text", label: "Tempel teks" },
  { value: "pdf", label: "PDF" },
];

export function AiGenerateButton() {
  const { adapter } = useEditorContext();
  const [open, setOpen] = useState(false);
  const generate = adapter.generateQuestions;
  if (!generate) return null;
  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <Sparkles /> Buat dengan AI
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Buat soal dengan AI"
          description="AI menyusun draf soal. Periksa setiap soal sebelum dipakai: AI bisa salah."
          className="max-w-2xl"
        >
          {open && <AiGenerator generate={generate} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** One line a teacher can check at a glance: the answer the draft expects. */
export function answerSummary(question: Question): string {
  const c = question.config as Record<string, unknown>;
  const text = (list: unknown, ids?: unknown) =>
    (list as Item[])
      .filter((i) => !ids || (ids as string[]).includes(i.id))
      .map((i) => i.text)
      .join(", ");
  switch (question.type) {
    case "multiple_choice":
      return text(c.options, c.correctIds);
    case "true_false":
      return c.correct ? "Benar" : "Salah";
    case "short_answer":
      return (c.accepted as string[]).join(" / ");
    case "number":
      return Number(c.tolerance) > 0
        ? `${formatNumber(Number(c.value))} ± ${formatNumber(Number(c.tolerance))}`
        : formatNumber(Number(c.value));
    case "sequencing":
      return (c.items as Item[]).map((i) => i.text).join(" → ");
    case "odd_one_out":
      return text(c.items, [c.oddId]);
    default:
      return "";
  }
}

function AiGenerator({
  generate,
  onDone,
}: {
  generate: (form: FormData) => Promise<AiResult>;
  onDone: () => void;
}) {
  const { store } = useEditorContext();
  const [source, setSource] = useState<Source>("topic");
  const [types, setTypes] = useState<AiType[]>(["multiple_choice", "true_false", "short_answer"]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Extract<AiResult, { ok: true }> | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("source", source);
    const pdf = form.get("pdf");
    if (source === "pdf" && pdf instanceof File && pdf.size > AI_LIMITS.maxPdfBytes) {
      setError("PDF maksimal 10 MB.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const next = await generate(form).catch(() => null);
      if (!next) setError("Gagal menghubungi server. Coba lagi.");
      else if (!next.ok) setError(next.error);
      else {
        setResult(next);
        setPicked(new Set(next.questions.map((q) => q.id)));
      }
    });
  }

  function add() {
    if (!result) return;
    const chosen = result.questions.filter((q) => picked.has(q.id));
    store.getState().appendQuestions(chosen);
    toast.success(`${chosen.length} soal AI ditambahkan ke draf. Periksa sebelum publish.`);
    onDone();
  }

  if (result) {
    return (
      <div className="flex min-h-0 flex-col gap-3">
        <p className="text-sm text-fg-muted">
          Centang soal yang ingin dipakai. Semuanya masuk sebagai draf dan bisa diubah di editor.
          {result.dropped > 0 && ` ${result.dropped} soal dilewati karena tidak lengkap.`}
        </p>
        <ul
          className="flex max-h-[50dvh] flex-col gap-1.5 overflow-y-auto"
          aria-label="Soal dari AI"
        >
          {result.questions.map((q, i) => {
            const on = picked.has(q.id);
            return (
              <li key={q.id}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                    on ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() =>
                      setPicked((current) => {
                        const next = new Set(current);
                        if (next.has(q.id)) next.delete(q.id);
                        else next.add(q.id);
                        return next;
                      })
                    }
                    className="mt-1 accent-accent"
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">
                      {i + 1}. {q.prompt}
                    </span>
                    <span className="text-xs text-fg-subtle">
                      {questionDefinitions[q.type].label} · Jawaban: {answerSummary(q)}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-fg-subtle">Sisa kuota hari ini: {result.remaining}×.</p>
        <DialogFooter>
          <Button variant="secondary" onClick={() => setResult(null)}>
            Ulangi
          </Button>
          <Button onClick={add} disabled={picked.size === 0}>
            Tambahkan {picked.size} soal ke draf
          </Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <fieldset className="flex flex-wrap gap-2" disabled={pending}>
        <legend className="mb-1.5 text-sm font-medium">Sumber</legend>
        {SOURCES.map((s) => (
          <label
            key={s.value}
            className="cursor-pointer rounded-full border border-line px-3 py-1 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent-fg"
          >
            <input
              type="radio"
              name="source-choice"
              value={s.value}
              checked={source === s.value}
              onChange={() => setSource(s.value)}
              className="sr-only"
            />
            {s.label}
          </label>
        ))}
      </fieldset>

      {source === "text" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-text">Bahan</Label>
          <Textarea
            id="ai-text"
            name="text"
            rows={7}
            maxLength={AI_LIMITS.maxTextChars}
            placeholder="Tempel teks materi (bab buku, ringkasan, artikel)…"
            required
          />
        </div>
      )}
      {source === "pdf" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-pdf">File PDF (maks. 10 MB)</Label>
          <Input id="ai-pdf" name="pdf" type="file" accept="application/pdf,.pdf" required />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ai-topic">{source === "topic" ? "Topik" : "Fokus (opsional)"}</Label>
        <Input
          id="ai-topic"
          name="topic"
          maxLength={300}
          placeholder={
            source === "topic"
              ? "mis. Daur air untuk kelas 5 SD"
              : "mis. hanya bab 2, tentang fotosintesis"
          }
          required={source === "topic"}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ai-count">Jumlah soal</Label>
          <Select id="ai-count" name="count" defaultValue="10">
            {[5, 10, 15, 20].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex min-w-48 flex-1 flex-col gap-1.5">
          <Label htmlFor="ai-level">Tingkat</Label>
          <Input
            id="ai-level"
            name="level"
            maxLength={60}
            placeholder="mis. Kelas 5 SD, SMA, umum"
          />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-x-4 gap-y-2">
        <legend className="mb-1.5 text-sm font-medium">Tipe soal</legend>
        {AI_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="types"
              value={type}
              checked={types.includes(type)}
              onChange={() =>
                setTypes((current) =>
                  current.includes(type) ? current.filter((t) => t !== type) : [...current, type],
                )
              }
              className="accent-accent"
            />
            {AI_TYPE_LABELS[type]}
          </label>
        ))}
      </fieldset>
      {source !== "topic" && (
        <p className="text-xs text-fg-subtle">
          Bahan dikirim ke layanan AI (Google Gemini) hanya untuk menyusun soal ini.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending || types.length === 0}>
          {pending ? <LoaderCircle className="animate-spin" /> : <Sparkles />}
          {pending ? "AI sedang menyusun soal… (bisa sampai 1 menit)" : "Buat soal"}
        </Button>
      </DialogFooter>
    </form>
  );
}
