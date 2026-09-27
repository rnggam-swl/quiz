"use client";

import { Ellipsis, Eye, EyeOff, Square, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { toast } from "@/components/ui/Toast";
import type { Policy } from "@/engine/policy";

import {
  deleteExamAction,
  endExamAction,
  setResultsReleasedAction,
} from "@/app/(dashboard)/quizzes/exam-actions";

type Confirm = "end" | "delete" | null;

/** End the exam, release results, delete — the host's exam-wide actions. */
export function ExamActions({
  examId,
  quizId,
  closed,
  releaseMode,
  released,
  manuallyReleased,
}: {
  examId: string;
  quizId: string;
  closed: boolean;
  releaseMode: Policy["releaseResults"];
  released: boolean;
  manuallyReleased: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, setConfirm] = useState<Confirm>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action().catch(() => ({ ok: false, error: "Koneksi bermasalah." }));
      setConfirm(null);
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? "Gagal menyimpan.");
    });
  }

  // "Immediately" releases on its own; otherwise the host can release early or take it back.
  const canToggleRelease = releaseMode !== "immediately";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canToggleRelease &&
        (released ? (
          manuallyReleased && (
            <Button
              variant="secondary"
              disabled={pending}
              onClick={() =>
                run(() => setResultsReleasedAction(examId, false), "Rilis nilai dibatalkan.")
              }
            >
              <EyeOff /> Tarik nilai
            </Button>
          )
        ) : (
          <Button
            variant="secondary"
            disabled={pending}
            onClick={() =>
              run(
                () => setResultsReleasedAction(examId, true),
                "Nilai dirilis. Peserta bisa melihatnya sekarang.",
              )
            }
          >
            <Eye /> Rilis nilai
          </Button>
        ))}
      {!closed && (
        <Button variant="danger" disabled={pending} onClick={() => setConfirm("end")}>
          <Square /> Akhiri ujian
        </Button>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Menu ujian" disabled={pending}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem
            className="text-danger [&_svg]:text-danger"
            onSelect={() => setConfirm("delete")}
          >
            <Trash2 /> Hapus ujian
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        {confirm === "end" ? (
          <DialogContent
            title="Akhiri ujian sekarang?"
            description="Peserta yang masih mengerjakan langsung dihentikan, dan jawaban yang sudah tersimpan dinilai. Tidak ada yang bisa mulai lagi."
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Batal</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() => run(() => endExamAction(examId), "Ujian diakhiri.")}
              >
                Akhiri ujian
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : (
          <DialogContent
            title="Hapus ujian ini?"
            description="Semua percobaan, jawaban, dan nilai peserta di ujian ini ikut terhapus. Ini tidak bisa dibatalkan."
          >
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary">Batal</Button>
              </DialogClose>
              <Button
                variant="danger"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await deleteExamAction(examId).catch(() => null);
                    if (!result?.ok) {
                      setConfirm(null);
                      toast.error("Gagal menghapus ujian.");
                      return;
                    }
                    toast("Ujian dihapus.");
                    router.push(`/quizzes/${quizId}/exams`);
                  })
                }
              >
                Hapus permanen
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
