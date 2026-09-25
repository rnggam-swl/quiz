"use client";

import { useState, type ReactNode } from "react";

import { ANSWER_SHAPE_NAMES, ANSWER_SLOTS, AnswerShape } from "@/components/player/AnswerShape";
import { Button3D } from "@/components/player/Button3D";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/Dialog";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";

// Theme presets from the prototype, to eyeball auto text colour on each.
const themePresets = [
  { name: "Indigo", color: "#4f5bea" },
  { name: "Emerald", color: "#10b981" },
  { name: "Amber", color: "#f59e0b" },
  { name: "Rose", color: "#ef4444" },
  { name: "Violet", color: "#8b5cf6" },
  { name: "Sky", color: "#0ea5e9" },
  { name: "Pink", color: "#ec4899" },
  { name: "Slate", color: "#1a1a24" },
];

const tokens = [
  "canvas",
  "surface",
  "surface-muted",
  "line",
  "line-strong",
  "fg",
  "fg-muted",
  "fg-subtle",
  "accent",
  "success",
  "warning",
  "danger",
];

type Scheme = "system" | "light" | "dark";

export function Playground() {
  const [scheme, setScheme] = useState<Scheme>("system");
  const [selected, setSelected] = useState<number | null>(null);
  const [autosave, setAutosave] = useState(true);

  function applyScheme(next: Scheme) {
    setScheme(next);
    const root = document.documentElement;
    if (next === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", next);
  }

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Playground</h1>
          <p className="text-sm text-fg-muted">
            Token dan komponen P0. Hanya tersedia di development.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="scheme">Tema</Label>
          <Select
            id="scheme"
            value={scheme}
            onChange={(e) => applyScheme(e.target.value as Scheme)}
            className="w-36"
          >
            <option value="system">Ikuti sistem</option>
            <option value="light">Terang</option>
            <option value="dark">Gelap</option>
          </Select>
        </div>
      </header>

      <Section title="Token warna">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tokens.map((token) => (
            <div key={token} className="flex items-center gap-2 text-sm">
              <span
                className="size-8 shrink-0 rounded-lg border border-line"
                style={{ background: `var(--${token})` }}
              />
              <code className="font-mono text-xs text-fg-muted">--{token}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Editor · tombol & input">
        <div className="flex flex-wrap gap-2">
          <Button>Simpan</Button>
          <Button variant="secondary">Pratinjau</Button>
          <Button variant="ghost">Batal</Button>
          <Button variant="danger">Hapus soal</Button>
          <Button disabled>Nonaktif</Button>
          <Button size="sm" variant="secondary">
            Kecil
          </Button>
          <Tooltip content="Tambah soal (Ctrl+Enter)">
            <Button size="icon" variant="secondary" aria-label="Tambah soal">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Button>
          </Tooltip>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="title">Judul soal</Label>
            <Input id="title" placeholder="Tulis pertanyaan…" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="type">Tipe soal</Label>
            <Select id="type" defaultValue="multiple_choice">
              <option value="multiple_choice">Pilihan Ganda</option>
              <option value="true_false">Benar / Salah</option>
              <option value="short_answer">Isian Singkat</option>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="invalid">Input tidak valid</Label>
            <Input id="invalid" aria-invalid defaultValue="Opsi kosong" />
            <p className="text-xs text-danger">Soal #3 minimal butuh 2 opsi.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="help">Teks bantuan</Label>
            <Textarea id="help" placeholder="Opsional" />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-line bg-surface p-3">
            <Label htmlFor="autosave">Autosave</Label>
            <Switch id="autosave" checked={autosave} onCheckedChange={setAutosave} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => toast("Quiz tersimpan")}>
            Toast biasa
          </Button>
          <Button variant="secondary" onClick={() => toast.success("Quiz di-publish! 🎉")}>
            Toast sukses
          </Button>
          <Button variant="secondary" onClick={() => toast.error("Gagal menyimpan, coba lagi")}>
            Toast error
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Buka dialog</Button>
            </DialogTrigger>
            <DialogContent
              title="Hapus soal ini?"
              description="Soal dan semua opsinya akan dihapus dari quiz."
            >
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Batal</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="danger" onClick={() => toast("Soal dihapus")}>
                    Hapus
                  </Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </Section>

      <Section title="Player · Button3D per preset tema (warna teks otomatis)">
        <div className="flex flex-wrap gap-3">
          {themePresets.map((preset) => (
            <Button3D key={preset.name} color={preset.color} size="md">
              {preset.name}
            </Button3D>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button3D size="md">Tema default</Button3D>
          <Button3D size="md" color="#eeeef4" className="border-white">
            Kembali
          </Button3D>
          <Button3D size="md" disabled>
            Nonaktif
          </Button3D>
        </div>
      </Section>

      <Section title="Player · opsi jawaban (warna + bentuk)">
        <div className="grid gap-3 sm:grid-cols-2">
          {ANSWER_SLOTS.slice(0, 4).map((slot) => (
            <Button3D
              key={slot}
              block
              size="xl"
              color={`var(--answer-${slot})`}
              textColor={`var(--on-answer-${slot})`}
              pressed={selected === slot}
              onClick={() => setSelected(slot)}
              className="justify-start rounded-2xl text-left"
            >
              <AnswerShape slot={slot} className="size-6 bg-transparent" />
              <span>
                Opsi {slot} <span className="sr-only">({ANSWER_SHAPE_NAMES[slot]})</span>
              </span>
            </Button3D>
          ))}
        </div>
        <div className="flex gap-3 text-sm">
          <span className="animate-pop rounded-full bg-success-soft px-3 py-1 font-semibold text-success">
            +850 🔥 ×3
          </span>
          <span className="animate-shake rounded-full bg-danger-soft px-3 py-1 font-semibold text-danger">
            Belum pas, coba lagi ya
          </span>
        </div>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs font-semibold tracking-wider text-fg-subtle uppercase">{title}</h2>
      {children}
    </section>
  );
}
