"use client";

import { BarChart3, ClipboardCheck, Copy, Ellipsis, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
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

import { deleteQuizAction, duplicateQuizAction } from "./actions";

export function QuizCardMenu({ quizId, title }: { quizId: string; title: string }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const name = title || "Quiz tanpa judul";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Menu untuk ${name}`} disabled={pending}>
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-44">
          <DropdownMenuItem asChild>
            <Link href={`/quizzes/${quizId}/edit`}>
              <Pencil /> Edit
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/quizzes/${quizId}/results`}>
              <BarChart3 /> Hasil
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/quizzes/${quizId}/exams`}>
              <ClipboardCheck /> Ujian
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() =>
              startTransition(async () => {
                const result = await duplicateQuizAction(quizId);
                if (result.ok) toast.success("Quiz diduplikat.");
                else toast.error("Gagal menduplikat quiz.");
              })
            }
          >
            <Copy /> Duplikat
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-danger [&_svg]:text-danger"
            onSelect={() => setConfirmDelete(true)}
          >
            <Trash2 /> Hapus
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent
          title={`Hapus “${name}”?`}
          description="Semua soal dan versi yang sudah terbit ikut terhapus. Ini tidak bisa dibatalkan."
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
                  const result = await deleteQuizAction(quizId);
                  setConfirmDelete(false);
                  if (result.ok) toast("Quiz dihapus.");
                  else toast.error("Gagal menghapus quiz.");
                })
              }
            >
              Hapus permanen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
