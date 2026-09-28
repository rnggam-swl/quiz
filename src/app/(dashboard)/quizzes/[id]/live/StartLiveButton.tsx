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

type Toggle = "shuffleQuestions" | "shuffleOptions" | "autoAdvance";

const TOGGLES: { key: Toggle; label: string }[] = [
  { key: "shuffleQuestions", label: "Acak urutan soal" },
  { key: "shuffleOptions", label: "Acak urutan pilihan" },
  { key: "autoAdvance", label: "Lanjut otomatis setelah jawaban dan papan skor" },
];

/** "Mulai live" (P5-09): a few options, then straight to the lobby on the projector. */
export function StartLiveButton({
  quizId,
  skipped,
}: {
  quizId: string;
  /** Questions a live session can't play (e.g. essays). */
  skipped: { number: number; typeLabel: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<LiveForm>(DEFAULT_LIVE_FORM);
  const [pending, startTransition] = useTransition();
  const set = (patch: Partial<LiveForm>) => setForm({ ...form, ...patch });

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
          {skipped.length > 0 && (
            <p className="flex gap-2 rounded-xl bg-warning-soft p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <span>
                Dilewati karena tidak bisa dimainkan live:{" "}
                {skipped.map((s) => `soal ${s.number} (${s.typeLabel})`).join(", ")}.
              </span>
            </p>
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
          <Button onClick={start} disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" />} Buka lobby
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
