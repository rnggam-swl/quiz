"use client";

import { Library, LoaderCircle, Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { duplicateQuestion } from "@/questions/question";
import { QUESTION_TYPES, questionDefinitions, type QuestionType } from "@/questions/registry";

import { useEditorContext } from "./EditorContext";
import type { BankItem, QuestionBank, TagUse } from "./types";

// Bank soal (P8-12, docs/04-question-types.md#bank-soal): find questions in the host's
// other quizzes and copy them into this one (new ids; the originals stay as they are).

export function QuestionBankButton() {
  const { adapter } = useEditorContext();
  const [open, setOpen] = useState(false);
  if (!adapter.questionBank) return null;
  return (
    <>
      <Button variant="secondary" className="w-full" onClick={() => setOpen(true)}>
        <Library /> Ambil dari bank soal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          title="Bank soal"
          description="Soal dari quiz-quiz kamu yang lain. Yang dipilih disalin ke akhir quiz ini."
          className="max-w-2xl"
        >
          {open && <BankBrowser bank={adapter.questionBank} onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function BankBrowser({ bank, onDone }: { bank: QuestionBank; onDone: () => void }) {
  const { store } = useEditorContext();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [type, setType] = useState<QuestionType | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<TagUse[]>([]);
  const [items, setItems] = useState<BankItem[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selected, setSelected] = useState<Map<string, BankItem>>(new Map());
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    bank.tags().then(setAllTags, () => setAllTags([]));
  }, [bank]);

  // Typing settles for 300 ms before searching.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 300);
    return () => clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await bank.search({ text: query, tags, type, page: 0 });
      if (cancelled) return;
      setItems(result.items);
      setHasMore(result.hasMore);
      setPage(0);
    });
    return () => {
      cancelled = true;
    };
  }, [bank, query, tags, type]);

  function more() {
    startTransition(async () => {
      const result = await bank.search({ text: query, tags, type, page: page + 1 });
      setItems((current) => [...current, ...result.items]);
      setHasMore(result.hasMore);
      setPage(page + 1);
    });
  }

  function toggle(item: BankItem) {
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(item.question.id)) next.delete(item.question.id);
      else next.set(item.question.id, item);
      return next;
    });
  }

  function add() {
    const questions = [...selected.values()].map((item) => duplicateQuestion(item.question));
    store.getState().appendQuestions(questions);
    toast.success(`${questions.length} soal disalin dari bank soal.`);
    onDone();
  }

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cari teks pertanyaan…"
            aria-label="Cari soal"
            className="pl-9"
            autoFocus
          />
        </div>
        <Select
          value={type ?? ""}
          onChange={(e) => setType((e.target.value || null) as QuestionType | null)}
          aria-label="Tipe soal"
          className="w-44"
        >
          <option value="">Semua tipe</option>
          {QUESTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {questionDefinitions[t].label}
            </option>
          ))}
        </Select>
      </div>

      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter tag">
          {allTags.slice(0, 30).map(({ tag, uses }) => {
            const on = tags.includes(tag);
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => setTags(on ? tags.filter((t) => t !== tag) : [...tags, tag])}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  on
                    ? "border-accent bg-accent-soft text-accent-fg"
                    : "border-line text-fg-muted hover:bg-surface-muted",
                )}
              >
                {tag} <span className="text-fg-subtle">{uses}</span>
              </button>
            );
          })}
        </div>
      )}

      <ul
        className="flex max-h-[45dvh] min-h-24 flex-col gap-1.5 overflow-y-auto"
        aria-label="Hasil bank soal"
        aria-busy={pending}
      >
        {items.map((item) => {
          const { question } = item;
          const checked = selected.has(question.id);
          return (
            <li key={question.id}>
              <label
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                  checked ? "border-accent bg-accent-soft" : "border-line hover:bg-surface-muted",
                )}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item)}
                  className="mt-1 accent-accent"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="line-clamp-2 text-sm">
                    {question.prompt || "(tanpa teks pertanyaan)"}
                  </span>
                  <span className="truncate text-xs text-fg-subtle">
                    {questionDefinitions[question.type].label} · {item.quizTitle}
                    {question.tags.length > 0 && ` · ${question.tags.join(", ")}`}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
        {!pending && items.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-fg-subtle">
            {query || tags.length || type
              ? "Tidak ada soal yang cocok."
              : "Belum ada soal di quiz-quiz lain."}
          </li>
        )}
        {pending && (
          <li className="flex items-center justify-center gap-2 p-3 text-sm text-fg-muted">
            <LoaderCircle className="size-4 animate-spin" /> Mencari…
          </li>
        )}
        {hasMore && !pending && (
          <li className="flex justify-center">
            <Button variant="ghost" size="sm" onClick={more}>
              Muat lebih banyak
            </Button>
          </li>
        )}
      </ul>

      <DialogFooter>
        <DialogClose asChild>
          <Button variant="secondary">Batal</Button>
        </DialogClose>
        <Button onClick={add} disabled={selected.size === 0}>
          Salin {selected.size || ""} soal
        </Button>
      </DialogFooter>
    </div>
  );
}
