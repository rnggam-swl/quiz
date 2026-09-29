"use client";

import { ArrowLeft, Eye, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Tooltip } from "@/components/ui/Tooltip";

import { EditorProvider, useEditor, useEditorContext } from "./EditorContext";
import { PreviewDialog } from "./PreviewDialog";
import { PropertiesPanel } from "./PropertiesPanel";
import { PublishButton } from "./PublishButton";
import { QuestionCanvas } from "./QuestionCanvas";
import { QuestionList } from "./QuestionList";
import { SaveIndicator } from "./SaveIndicator";
import { SheetMenu } from "./SheetMenu";
import { createEditorStore } from "./store";
import type { EditorAdapter, EditorInitialState } from "./types";
import { useAutosave } from "./useAutosave";

/**
 * The quiz builder: question list · question canvas · properties.
 * `adapter` must be stable (Server Actions, or a memoized fake in the playground).
 */
export function QuizEditor({
  initial,
  adapter,
  backHref,
  headerActions,
}: {
  initial: EditorInitialState;
  adapter: EditorAdapter;
  backHref: string;
  /** Extra header buttons from the page (e.g. "Bagikan"); rendered inside the editor context. */
  headerActions?: ReactNode;
}) {
  const [store] = useState(() => createEditorStore(initial));
  const { saveNow } = useAutosave(store, adapter.saveDraft);
  const context = useMemo(() => ({ store, adapter, saveNow }), [store, adapter, saveNow]);

  return (
    <EditorProvider value={context}>
      <KeyboardShortcuts />
      <div className="flex h-dvh flex-col bg-canvas">
        <EditorHeader backHref={backHref} actions={headerActions} />
        <ConflictBanner />
        <div className="grid min-h-0 flex-1 grid-rows-[auto_1fr_auto] lg:grid-cols-[288px_minmax(0,1fr)_320px] lg:grid-rows-1">
          <aside className="max-h-72 overflow-y-auto border-b border-line bg-surface lg:max-h-none lg:border-r lg:border-b-0">
            <QuestionList />
          </aside>
          <main className="min-h-0 overflow-y-auto">
            <QuestionCanvas />
          </main>
          <aside className="min-h-0 border-t border-line bg-surface lg:overflow-y-auto lg:border-t-0 lg:border-l">
            <PropertiesPanel />
          </aside>
        </div>
      </div>
    </EditorProvider>
  );
}

function EditorHeader({ backHref, actions }: { backHref: string; actions?: ReactNode }) {
  const { store } = useEditorContext();
  const title = useEditor((s) => s.quiz.title);
  const [previewOpen, setPreviewOpen] = useState(false);
  const snapshot = useEditor((s) => (previewOpen ? s : null));

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-surface px-3 sm:gap-3">
      <Tooltip content="Kembali ke daftar quiz">
        <Button asChild variant="ghost" size="icon" aria-label="Kembali ke daftar quiz">
          <Link href={backHref}>
            <ArrowLeft />
          </Link>
        </Button>
      </Tooltip>
      <input
        id="header-title"
        value={title}
        maxLength={150}
        onChange={(e) => store.getState().setQuiz({ title: e.target.value })}
        placeholder="Quiz tanpa judul"
        aria-label="Judul quiz"
        className="h-9 min-w-0 flex-1 rounded-lg bg-transparent px-2 text-sm font-semibold text-fg outline-none placeholder:text-fg-placeholder hover:bg-surface-muted focus-visible:bg-surface-muted sm:max-w-80"
      />
      <SaveIndicator />
      <div className="ml-auto flex items-center gap-2">
        <Button variant="secondary" onClick={() => setPreviewOpen(true)} aria-label="Pratinjau">
          <Eye /> <span className="hidden sm:inline">Pratinjau</span>
        </Button>
        <SheetMenu />
        {actions}
        <PublishButton />
      </div>
      {snapshot && (
        <PreviewDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          quiz={snapshot.quiz}
          questions={snapshot.questions}
          startIndex={Math.max(
            0,
            snapshot.questions.findIndex((q) => q.id === snapshot.selectedId),
          )}
        />
      )}
    </header>
  );
}

function ConflictBanner() {
  const conflict = useEditor((s) => s.status === "conflict");
  if (!conflict) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-3 bg-danger-soft px-4 py-2 text-sm text-danger"
    >
      <span className="flex-1">
        Quiz ini diubah di tab atau perangkat lain, jadi perubahan di sini berhenti disimpan. Muat
        ulang untuk melihat versi terbaru.
      </span>
      <Button variant="danger" size="sm" onClick={() => window.location.reload()}>
        <RotateCcw /> Muat ulang
      </Button>
    </div>
  );
}

function isTyping(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/** Ctrl+S save · Ctrl+Enter add question · Ctrl+D duplicate · Alt+↑/↓ move question. */
function KeyboardShortcuts() {
  const { store, saveNow } = useEditorContext();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      const state = store.getState();
      const selected = state.questions.find((q) => q.id === state.selectedId);
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveNow();
      } else if (mod && e.key === "Enter") {
        e.preventDefault();
        state.addQuestion(selected?.type ?? "multiple_choice", state.selectedId);
        requestAnimationFrame(() =>
          document.querySelector<HTMLTextAreaElement>("[data-autofocus-prompt]")?.focus(),
        );
      } else if (mod && e.key.toLowerCase() === "d" && selected) {
        e.preventDefault();
        state.duplicate(selected.id);
      } else if (
        e.altKey &&
        (e.key === "ArrowUp" || e.key === "ArrowDown") &&
        selected &&
        !isTyping(e.target)
      ) {
        e.preventDefault();
        const from = state.questions.indexOf(selected);
        state.move(from, from + (e.key === "ArrowUp" ? -1 : 1));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, saveNow]);

  return null;
}
