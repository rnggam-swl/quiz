"use client";

import { Clock, Ellipsis, RotateCcw, Undo2 } from "lucide-react";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Input, Label } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";

import { attemptAction } from "@/app/(dashboard)/quizzes/exam-actions";

type Kind = "extend" | "reopen" | "reset";

const COPY: Record<Kind, { title: string; description: string; button: string; done: string }> = {
  extend: {
    title: "Tambah waktu",
    description: "Batas waktu peserta ini diperpanjang, dihitung dari batas sekarang.",
    button: "Tambah waktu",
    done: "Waktu ditambah.",
  },
  reopen: {
    title: "Buka ulang percobaan",
    description:
      "Peserta bisa melanjutkan percobaan yang sama dengan jawaban yang sudah tersimpan, selama waktu yang kamu beri.",
    button: "Buka ulang",
    done: "Percobaan dibuka ulang.",
  },
  reset: {
    title: "Reset percobaan?",
    description:
      "Percobaan ini dan semua jawabannya dihapus, lalu peserta bisa mulai dari awal. Ini tidak bisa dibatalkan.",
    button: "Reset",
    done: "Percobaan direset.",
  },
};

/** Per-participant actions on the monitor (P4-10): extend, reopen, reset. */
export function AttemptMenu({
  examId,
  attemptId,
  name,
  open,
}: {
  examId: string;
  attemptId: string;
  name: string;
  /** Whether the attempt is still in progress (extend) or closed (reopen). */
  open: boolean;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [minutes, setMinutes] = useState("10");
  const [pending, startTransition] = useTransition();
  const copy = kind ? COPY[kind] : null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!kind) return;
    const m = Number(minutes);
    if (kind !== "reset" && (!Number.isInteger(m) || m < 1 || m > 600)) {
      toast.error("Isi 1–600 menit.");
      return;
    }
    startTransition(async () => {
      const result = await attemptAction(
        examId,
        attemptId,
        kind === "reset" ? { kind } : { kind, minutes: m },
      ).catch(() => ({ ok: false as const, error: "Koneksi bermasalah." }));
      if (result.ok) {
        toast.success(COPY[kind].done);
        setKind(null);
      } else toast.error(result.error);
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Aksi untuk ${name}`} disabled={pending}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          {open ? (
            <DropdownMenuItem onSelect={() => setKind("extend")}>
              <Clock /> Tambah waktu
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => setKind("reopen")}>
              <Undo2 /> Buka ulang
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            className="text-danger [&_svg]:text-danger"
            onSelect={() => setKind("reset")}
          >
            <RotateCcw /> Reset percobaan
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={kind !== null} onOpenChange={(o) => !o && setKind(null)}>
        {copy && (
          <DialogContent title={`${copy.title} · ${name}`} description={copy.description}>
            <form onSubmit={submit} className="flex flex-col gap-4">
              {kind !== "reset" && (
                <div className="flex items-center gap-2">
                  <Label htmlFor={`minutes-${attemptId}`} className="font-normal">
                    {kind === "extend" ? "Tambah" : "Selama"}
                  </Label>
                  <Input
                    id={`minutes-${attemptId}`}
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={600}
                    className="w-24"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                    autoFocus
                  />
                  <span className="text-sm">menit</span>
                </div>
              )}
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="secondary">Batal</Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant={kind === "reset" ? "danger" : "primary"}
                  disabled={pending}
                >
                  {copy.button}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}
