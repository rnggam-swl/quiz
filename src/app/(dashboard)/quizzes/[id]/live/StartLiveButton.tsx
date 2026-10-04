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
import { DEFAULT_LATE_JOIN, DEFAULT_LIVE_FORM, type LiveForm } from "@/engine/live/form";
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
  {
    value: "battle_royale",
    label: "Battle Royale",
    hint: "Salah atau telat = nyawa berkurang; bertahan sampai tinggal satu.",
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
          <div role="radiogroup" aria-label="Mode" className="grid gap-2 sm:grid-cols-3">
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
                  onChange={() => set({ mode: m.value, lateJoin: DEFAULT_LATE_JOIN[m.value] })}
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
          {form.mode === "battle_royale" && (
            <div className="flex flex-col gap-3 rounded-xl bg-surface-muted p-3">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="live-lives" className="font-normal">
                  Nyawa
                </Label>
                <Select
                  id="live-lives"
                  className="w-36"
                  value={form.lives}
                  onChange={(e) => set({ lives: Number(e.target.value) })}
                >
                  {[1, 2, 3, 5].map((n) => (
                    <option key={n} value={n}>
                      {"❤️".repeat(Math.min(n, 5))} {n}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="live-shrink" className="font-normal">
                  Zona menyempit per putaran
                </Label>
                <Select
                  id="live-shrink"
                  className="w-36"
                  value={form.shrinkTimerPct}
                  onChange={(e) => set({ shrinkTimerPct: Number(e.target.value) })}
                >
                  <option value={0}>Tidak</option>
                  <option value={10}>−10% waktu</option>
                  <option value={20}>−20% waktu</option>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="live-slowest" className="font-normal">
                  Jika semua benar, yang paling lambat kehilangan nyawa
                </Label>
                <Switch
                  id="live-slowest"
                  checked={form.eliminateSlowest}
                  onCheckedChange={(checked) => set({ eliminateSlowest: checked })}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="live-sudden" className="font-normal">
                  Sudden death jika soal habis (5 detik, sekali salah tersingkir)
                </Label>
                <Switch
                  id="live-sudden"
                  checked={form.suddenDeath}
                  onCheckedChange={(checked) => set({ suddenDeath: checked })}
                />
              </div>
              <p className="text-xs text-fg-subtle">
                Yang tersingkir tetap bisa menjawab sebagai penonton untuk poin bayangan.
              </p>
            </div>
          )}
          {form.mode === "battle_buzzer" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="live-variant" className="font-normal">
                  Cara menjawab
                </Label>
                <Select
                  id="live-variant"
                  className="w-44"
                  value={form.buzzVariant}
                  onChange={(e) => set({ buzzVariant: e.target.value as typeof form.buzzVariant })}
                >
                  <option value="first_correct">Tercepat benar</option>
                  <option value="buzz_then_answer">Pencet lalu jawab</option>
                </Select>
              </div>
              <p className="text-xs text-fg-subtle">
                {form.buzzVariant === "buzz_then_answer"
                  ? "Siapa yang pertama menekan BUZZ mendapat giliran menjawab. Salah atau waktunya habis: giliran dibuka lagi untuk yang lain."
                  : "Semua menjawab langsung; jawaban benar pertama menang."}
              </p>
              {form.buzzVariant === "buzz_then_answer" && (
                <div className="mt-2 flex items-center justify-between gap-3">
                  <Label htmlFor="live-hold" className="font-normal">
                    Waktu menjawab setelah BUZZ
                  </Label>
                  <Select
                    id="live-hold"
                    className="w-36"
                    value={form.holdS}
                    onChange={(e) => set({ holdS: Number(e.target.value) })}
                  >
                    {[3, 5, 10, 15].map((sec) => (
                      <option key={sec} value={sec}>
                        {sec} detik
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="mt-2 flex items-center justify-between gap-3">
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
              {form.buzzVariant === "first_correct" && (
                <>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <Label htmlFor="live-grace" className="font-normal">
                      Jeda toleransi
                    </Label>
                    <Select
                      id="live-grace"
                      className="w-36"
                      value={form.graceMs}
                      onChange={(e) => set({ graceMs: Number(e.target.value) })}
                    >
                      <option value={0}>Mati</option>
                      <option value={250}>250 ms</option>
                      <option value={500}>500 ms</option>
                    </Select>
                  </div>
                  <p className="text-xs text-fg-subtle">
                    Jawaban benar yang masuk sesaat setelah yang pertama tetap diadu dengan waktu
                    reaksi di HP, supaya sinyal lambat tidak langsung kalah.
                  </p>
                </>
              )}
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
          <div className="flex flex-col gap-2 rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="live-teams" className="font-normal">
                Mode tim
              </Label>
              <Switch
                id="live-teams"
                checked={form.teamsEnabled}
                onCheckedChange={(checked) => set({ teamsEnabled: checked })}
              />
            </div>
            {form.teamsEnabled && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="live-team-count" className="font-normal">
                    Jumlah tim
                  </Label>
                  <Select
                    id="live-team-count"
                    className="w-36"
                    value={form.teamCount}
                    onChange={(e) => set({ teamCount: Number(e.target.value) })}
                  >
                    {[2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n} tim
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="live-team-assign" className="font-normal">
                    Pembagian
                  </Label>
                  <Select
                    id="live-team-assign"
                    className="w-44"
                    value={form.teamAssign}
                    onChange={(e) => set({ teamAssign: e.target.value as LiveForm["teamAssign"] })}
                  >
                    <option value="auto">Otomatis rata</option>
                    <option value="choose">Peserta memilih</option>
                  </Select>
                </div>
                <p className="text-xs text-fg-subtle">
                  {form.mode === "live"
                    ? "Skor tim = rata-rata skor anggota, jadi tim kecil tidak dirugikan."
                    : form.mode === "battle_buzzer"
                      ? "Satu anggota menjawab untuk timnya di setiap soal; poinnya masuk ke tim."
                      : "Tim bertahan selama masih ada anggota yang punya nyawa."}
                </p>
              </>
            )}
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
