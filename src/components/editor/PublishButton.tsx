"use client";

import { CircleAlert, LoaderCircle, Rocket } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogClose, DialogContent, DialogFooter } from "@/components/ui/Dialog";
import { toast } from "@/components/ui/Toast";
import { validateQuiz, type QuizIssue } from "@/questions/question";

import { useEditor, useEditorContext } from "./EditorContext";
import { hasUnpublishedChanges } from "./store";

export function PublishButton() {
  const { store, adapter, saveNow } = useEditorContext();
  const [busy, setBusy] = useState(false);
  const [issues, setIssues] = useState<QuizIssue[] | null>(null);
  const unpublished = useEditor(hasUnpublishedChanges);
  const latestVersion = useEditor((s) => s.latestVersion);
  const conflict = useEditor((s) => s.status === "conflict");

  function showIssues(list: QuizIssue[]) {
    store.getState().setShowIssues(true);
    setIssues(list);
  }

  async function publish() {
    const { quiz, questions } = store.getState();
    const local = validateQuiz(quiz, questions);
    if (local.length) {
      showIssues(local);
      return;
    }
    setBusy(true);
    try {
      if (!(await saveNow())) {
        toast.error("Belum tersimpan. Tunggu sebentar lalu coba lagi.");
        return;
      }
      const { revision } = store.getState();
      const result = await adapter.publish({ quizId: quiz.id, revision });
      if (result.ok) {
        store.getState().markPublished(result.version, result.revision, result.slug);
        store.getState().setShowIssues(false);
        toast.success(`Quiz terbit! Versi ${result.version} siap dimainkan. 🎉`);
      } else if (result.error === "issues") {
        showIssues(result.issues);
      } else if (result.error === "conflict") {
        toast.error("Quiz baru saja diubah. Coba publish lagi.");
      } else {
        toast.error("Gagal mem-publish. Coba lagi.");
      }
    } finally {
      setBusy(false);
    }
  }

  function goTo(issue: QuizIssue) {
    const state = store.getState();
    if (issue.questionId) state.select(issue.questionId);
    setIssues(null);
    requestAnimationFrame(() => {
      if (issue.path === "prompt") {
        document.querySelector<HTMLTextAreaElement>("[data-autofocus-prompt]")?.focus();
      } else if (issue.path === "title") {
        document.getElementById("header-title")?.focus();
      }
    });
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <span className="hidden text-xs text-fg-subtle md:inline">
          {latestVersion === null
            ? "Belum terbit"
            : unpublished
              ? `v${latestVersion} · ada perubahan`
              : `v${latestVersion} · terbit`}
        </span>
        <Button onClick={publish} disabled={busy || conflict}>
          {busy ? <LoaderCircle className="animate-spin" /> : <Rocket />}
          {latestVersion === null ? "Publish" : "Publish ulang"}
        </Button>
      </div>

      <Dialog open={issues !== null} onOpenChange={(open) => !open && setIssues(null)}>
        <DialogContent
          title="Belum bisa di-publish"
          description={`Ada ${issues?.length ?? 0} hal yang perlu dibereskan dulu. Klik untuk menuju soalnya.`}
        >
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {issues?.map((issue, i) => (
              <li key={i}>
                <button
                  type="button"
                  onClick={() => goTo(issue)}
                  className="flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-muted"
                >
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary">Tutup</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
