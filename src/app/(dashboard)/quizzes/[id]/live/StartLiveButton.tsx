"use client";

import { LoaderCircle, MonitorPlay, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { createLiveSessionAction } from "@/app/(dashboard)/quizzes/live-actions";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { Label } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { toast } from "@/components/ui/Toast";
import { DEFAULT_LIVE_FORM, type LiveForm } from "@/engine/live/form";
import { cn } from "@/lib/cn";

type Toggle = "shuffleQuestions" | "shuffleOptions" | "autoAdvance";

const TOGGLES: { key: Toggle; label: string }[] = [
  { key: "shuffleQuestions", label: "Acak urutan soal" },
  { key: "shuffleOptions", label: "Acak urutan pilihan" },
  { key: "autoAdvance", label: "Lanjut otomatis setelah jawaban dan papan skor" },
];

type Listed = { number: number; typeLabel: string; note?: string };
export type ModeQuestions = Record<
  LiveForm["mode"],
  { playable: number; skipped: Listed[]; warned: Listed[] }
>;

const MODES: { value: LiveForm["mode"]; label: string; hint: string }[] = [
  {
    value: "live",
    label: "Live klasik",
    hint: "Semua menjawab; poin dari ketepatan dan kecepatan.",
  },
  {
    value: "battle_buzzer",
    label: "Rebutan",
    hint: "Yang tercepat benar menang, soal langsung terkunci.",
  },
];

/**
 * "Mulai live" (P5-09, P6-06): the mode and a few options, then straight to the lobby on
 * the projector. Questions the mode can't play are skipped — the dialog says which.
 */
export function StartLiveButton({
  quizId,
  questions,
}: {
  quizId: string;
  questions: ModeQuestions;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LiveForm>(DEFAULT_LIVE_FORM);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<LiveForm>) => setForm({ ...form, ...patch });
  const current = questions[form.mode];

  function start() {
    startTransition(async () => {
      const result = await createLiveSessionAction(quizId, form).catch(() => null);
      if (!result?.ok) {
        toast.error(result?.error ?? "Koneksi bermasalah. Coba lagi.");
        return;
      }
      router.push(`/host/${result.sessionId}`);
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <MonitorPlay /> Mulai live
      </Button>
      <DialogContent
        title="Mulai sesi live"
        description="Buka layar host di proyektor. Peserta bergabung dengan kode di halaman /join."
      >
        <div className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Mode" className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-xl border-2 p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent",
                  form.mode === m.value
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:bg-surface-muted",
                  questions[m.value].playable === 0 && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="radio"
                  name="live-mode"
                  className="sr-only"
                  checked={form.mode === m.value}
                  disabled={questions[m.value].playable === 0}
                  onChange={() => set({ mode: m.value })}
                />
                <span className="text-sm font-semibold">{m.label}</span>
                <span className="text-xs text-fg-muted">{m.hint}</span>
              </label>
            ))}
          </div>
          {current.skipped.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                Dilewati karena tidak bisa dimainkan di mode ini:{" "}
                {current.skipped.map((s) => `soal ${s.number} (${s.typeLabel})`).join(", ")}.
              </span>
            </p>
          )}
          {current.warned.length > 0 && (
            <ul className="flex flex-col gap-1 rounded-xl bg-surface-muted p-3 text-sm text-fg-muted">
              {current.warned.map((w) => (
                <li key={w.number}>
                  Soal {w.number} ({w.typeLabel}): {w.note ?? "periksa lagi."}
                </li>
              ))}
            </ul>
          )}
          {form.mode === "battle_buzzer" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="live-penalty" className="font-normal">
                  Penalti jawaban salah
                </Label>
                <Select
                  id="live-penalty"
                  className="w-36"
                  value={form.wrongPenalty}
                  onChange={(e) => set({ wrongPenalty: Number(e.target.value) })}
                >
                  {[0, 100, 250, 500].map((p) => (
                    <option key={p} value={p}>
                      {p === 0 ? "Tanpa penalti" : `−${p} poin`}
                    </option>
                  ))}
                </Select>
              </div>
              <p className="text-xs text-fg-subtle">
                Satu kesempatan per soal. Skor tidak pernah turun di bawah 0.
              </p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="live-timer" className="font-normal">
                Waktu per soal
              </Label>
              <Select
                id="live-timer"
                className="w-36"
                value={form.perQuestionS}
                onChange={(e) => set({ perQuestionS: Number(e.target.value) })}
              >
                {[10, 20, 30, 45, 60, 90, 120].map((s) => (
                  <option key={s} value={s}>
                    {s} detik
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-fg-subtle">
              Soal yang punya batas waktu sendiri tetap memakai batasnya.
            </p>
          </div>
          {TOGGLES.map((t) => (
            <div key={t.key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`live-${t.key}`} className="font-normal">
                {t.label}
              </Label>
              <Switch
                id={`live-${t.key}`}
                checked={form[t.key]}
                onCheckedChange={(checked) => set({ [t.key]: checked })}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="live-late" className="font-normal">
              Peserta yang telat
            </Label>
            <Select
              id="live-late"
              className="w-44"
              value={form.lateJoin}
              onChange={(e) => set({ lateJoin: e.target.value as LiveForm["lateJoin"] })}
            >
              <option value="allow">Boleh ikut</option>
              <option value="spectator">Hanya menonton</option>
              <option value="deny">Tidak boleh masuk</option>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Batal</Button>
          </DialogClose>
          <Button onClick={start} disabled={pending || current.playable === 0}>
            {pending && <LoaderCircle className="animate-spin" />} Buka lobby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
