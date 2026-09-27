"use client";

import { Check, CircleAlert, ImagePlus, LoaderCircle, Minus, X } from "lucide-react";
import { Tabs } from "radix-ui";
import { useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { toast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { readableTextColor } from "@/lib/color";
import { checkMediaFile, MEDIA_RULES } from "@/lib/media";
import { THEME_PRESETS } from "@/lib/theme";
import { MODE_LABELS, modeNote, modeSupport } from "@/questions/modes";
import { hasAuthoredContent, type Question } from "@/questions/question";
import {
  isQuestionType,
  QUESTION_TYPES,
  questionDefinitions,
  type QuestionType,
} from "@/questions/registry";
import { SESSION_MODES } from "@/questions/types";

import { useEditor, useEditorContext } from "./EditorContext";

const TIME_OPTIONS = [5, 10, 20, 30, 45, 60, 90, 120, 180, 300];
const POINT_OPTIONS = [
  { value: 0, label: "Tidak dinilai" },
  { value: 500, label: "500 (mudah)" },
  { value: 1000, label: "1000 (standar)" },
  { value: 2000, label: "2000 (sulit)" },
];

const tabClass =
  "flex-1 border-b-2 border-transparent px-3 py-3 text-xs font-semibold tracking-wide text-fg-subtle uppercase transition-colors hover:text-fg data-[state=active]:border-accent data-[state=active]:text-accent-fg";

export function PropertiesPanel() {
  return (
    <Tabs.Root defaultValue="question" className="flex min-h-0 flex-col">
      <Tabs.List className="flex border-b border-line" aria-label="Pengaturan">
        <Tabs.Trigger value="question" className={tabClass}>
          Soal
        </Tabs.Trigger>
        <Tabs.Trigger value="quiz" className={tabClass}>
          Quiz
        </Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="question" className="overflow-y-auto">
        <QuestionProperties />
      </Tabs.Content>
      <Tabs.Content value="quiz" className="overflow-y-auto">
        <QuizProperties />
      </Tabs.Content>
    </Tabs.Root>
  );
}

function Field({
  label,
  htmlFor,
  children,
  hint,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-xs text-fg-subtle">{hint}</p>}
    </div>
  );
}

/** Where this type can be used (docs/04 capability matrix), with the reason for any caveat. */
function ModeCompatibility({ type }: { type: QuestionType }) {
  const notes = SESSION_MODES.flatMap((mode) => {
    const note = modeNote(type, mode);
    return note && modeSupport(type, mode) !== "ok" ? [{ mode, note }] : [];
  });
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-wrap gap-1.5" aria-label="Bisa dipakai di mode">
        {SESSION_MODES.map((mode) => {
          const support = modeSupport(type, mode);
          const Icon = support === "ok" ? Check : support === "warn" ? CircleAlert : Minus;
          return (
            <li
              key={mode}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                support === "ok" && "bg-success-soft text-success",
                support === "warn" && "bg-warning-soft text-warning",
                support === "no" && "bg-surface-muted text-fg-muted line-through",
              )}
            >
              <Icon className="size-3" strokeWidth={3} aria-hidden />
              {MODE_LABELS[mode]}
              <span className="sr-only">
                {support === "ok"
                  ? ": bisa"
                  : support === "warn"
                    ? ": bisa, dengan catatan"
                    : ": tidak bisa"}
              </span>
            </li>
          );
        })}
      </ul>
      {notes.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-fg-muted">
          {notes.map(({ mode, note }) => (
            <li key={mode}>
              <span className="font-medium">{MODE_LABELS[mode]}:</span> {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function QuestionProperties() {
  const { store } = useEditorContext();
  const question = useEditor((s) => s.questions.find((q) => q.id === s.selectedId) ?? null);
  const [pendingType, setPendingType] = useState<QuestionType | null>(null);

  if (!question) {
    return <p className="p-4 text-sm text-fg-subtle">Pilih soal untuk melihat pengaturannya.</p>;
  }

  const patch = (p: Partial<Question>) => store.getState().updateQuestion(question.id, p);

  function requestType(type: QuestionType) {
    if (!question || type === question.type) return;
    const defaults = questionDefinitions[question.type].defaults();
    if (hasAuthoredContent(question.config, defaults)) setPendingType(type);
    else store.getState().changeType(question.id, type);
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Field label="Tipe soal" htmlFor="prop-type">
        <Select
          id="prop-type"
          value={question.type}
          onChange={(e) => isQuestionType(e.target.value) && requestType(e.target.value)}
        >
          {QUESTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {questionDefinitions[type].label}
            </option>
          ))}
        </Select>
        <ModeCompatibility type={question.type} />
      </Field>

      <Field label="Batas waktu" htmlFor="prop-time" hint="Dipakai di mode live dan battle.">
        <Select
          id="prop-time"
          value={question.timeLimitS ?? ""}
          onChange={(e) => patch({ timeLimitS: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Ikuti pengaturan sesi</option>
          {TIME_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s < 60 ? `${s} detik` : `${s / 60} menit`}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Poin" htmlFor="prop-points">
        <Select
          id="prop-points"
          value={question.points}
          onChange={(e) => patch({ points: Number(e.target.value) })}
        >
          {POINT_OPTIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Penjelasan"
        htmlFor="prop-explanation"
        hint="Ditampilkan setelah peserta menjawab."
      >
        <Textarea
          id="prop-explanation"
          value={question.explanation}
          maxLength={2000}
          rows={4}
          placeholder="Kenapa jawabannya begitu?"
          onChange={(e) => patch({ explanation: e.target.value })}
        />
      </Field>

      <TagsField tags={question.tags} onChange={(tags) => patch({ tags })} />

      <Dialog open={pendingType !== null} onOpenChange={(open) => !open && setPendingType(null)}>
        <DialogContent
          title="Ganti tipe soal?"
          description="Opsi dan kunci jawaban soal ini akan dihapus. Pertanyaan, media, dan pengaturan lain tetap."
        >
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Batal</Button>
            </DialogClose>
            <Button
              variant="danger"
              onClick={() => {
                if (pendingType) store.getState().changeType(question.id, pendingType);
                setPendingType(null);
              }}
            >
              Ganti tipe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TagsField({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");

  function commit(raw: string) {
    const next = raw
      .split(",")
      .map((t) => t.trim().toLowerCase().slice(0, 30))
      .filter((t) => t && !tags.includes(t));
    if (next.length) onChange([...tags, ...next].slice(0, 10));
    setDraft("");
  }

  return (
    <Field
      label="Tag"
      htmlFor="prop-tags"
      hint="Untuk bank soal di mode ujian. Pisahkan dengan koma."
    >
      {tags.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-0.5 pr-1 pl-2.5 text-xs"
            >
              {tag}
              <button
                type="button"
                aria-label={`Hapus tag ${tag}`}
                className="rounded-full p-0.5 text-fg-subtle hover:text-fg"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Input
        id="prop-tags"
        value={draft}
        placeholder="mis. aljabar, kelas-8"
        disabled={tags.length >= 10}
        onChange={(e) => {
          if (e.target.value.includes(",")) commit(e.target.value);
          else setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
          }
        }}
        onBlur={() => draft && commit(draft)}
      />
    </Field>
  );
}

function QuizProperties() {
  const { store, adapter } = useEditorContext();
  const quiz = useEditor((s) => s.quiz);
  const coverInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const setQuiz = store.getState().setQuiz;

  async function uploadCover(file: File) {
    const problem = file.type.startsWith("image/")
      ? checkMediaFile(file)
      : "Sampul harus berupa gambar.";
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const ref = await adapter.uploadMedia(file, quiz.id);
      setQuiz({ coverUrl: ref.url });
    } catch {
      toast.error("Gagal mengunggah sampul. Coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 p-4">
      <Field label="Judul quiz" htmlFor="quiz-title">
        <Input
          id="quiz-title"
          value={quiz.title}
          maxLength={150}
          placeholder="Quiz tanpa judul"
          onChange={(e) => setQuiz({ title: e.target.value })}
        />
      </Field>

      <Field label="Deskripsi" htmlFor="quiz-description">
        <Textarea
          id="quiz-description"
          value={quiz.description}
          maxLength={2000}
          rows={3}
          placeholder="Tentang apa quiz ini?"
          onChange={(e) => setQuiz({ description: e.target.value })}
        />
      </Field>

      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">Sampul</span>
        {quiz.coverUrl ? (
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Storage */}
            <img
              src={quiz.coverUrl}
              alt=""
              className="aspect-video w-full rounded-xl object-cover"
            />
            <Button
              variant="secondary"
              size="icon"
              className="absolute top-2 right-2 size-7"
              aria-label="Hapus sampul"
              onClick={() => setQuiz({ coverUrl: null })}
            >
              <X />
            </Button>
          </div>
        ) : (
          <Button
            variant="secondary"
            className="border-dashed"
            disabled={uploading}
            onClick={() => coverInput.current?.click()}
          >
            {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
            {uploading ? "Mengunggah…" : "Unggah sampul"}
          </Button>
        )}
        <input
          ref={coverInput}
          type="file"
          accept={MEDIA_RULES.image.types.join(",")}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void uploadCover(file);
          }}
        />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Tema</legend>
        <div className="grid grid-cols-4 gap-2">
          {THEME_PRESETS.map((preset) => {
            const active = (quiz.theme.primary ?? THEME_PRESETS[0].primary) === preset.primary;
            return (
              <button
                key={preset.name}
                type="button"
                title={preset.name}
                aria-label={`Tema ${preset.name}`}
                aria-pressed={active}
                onClick={() => setQuiz({ theme: { primary: preset.primary, bg: preset.bg } })}
                className={cn(
                  "flex aspect-square items-center justify-center rounded-xl border-2 transition-transform hover:scale-105",
                  active ? "border-fg" : "border-transparent",
                )}
                style={{ background: preset.primary, color: readableTextColor(preset.primary) }}
              >
                {active && <Check className="size-4" strokeWidth={3} />}
              </button>
            );
          })}
        </div>
        <label className="mt-1 flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="color"
            value={quiz.theme.primary ?? THEME_PRESETS[0].primary}
            onChange={(e) => setQuiz({ theme: { ...quiz.theme, primary: e.target.value } })}
            className="size-8 cursor-pointer rounded-lg border border-line bg-transparent"
          />
          Warna sendiri
        </label>
      </fieldset>
    </div>
  );
}
