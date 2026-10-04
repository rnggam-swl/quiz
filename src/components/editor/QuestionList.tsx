"use client";

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CircleAlert, Copy, GripVertical, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { Tooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/cn";
import { validateQuestion, type Question } from "@/questions/question";
import { questionDefinitions } from "@/questions/registry";
import { questionUI } from "@/questions/ui";

import { AddQuestionMenu } from "./AddQuestionMenu";
import { AiGenerateButton } from "./AiGenerateDialog";
import { QuestionBankButton } from "./QuestionBankDialog";
import { useEditor, useEditorContext } from "./EditorContext";

export function QuestionList() {
  const { store } = useEditorContext();
  const questions = useEditor((s) => s.questions);
  const selectedId = useEditor((s) => s.selectedId);
  const showIssues = useEditor((s) => s.showIssues);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = questions.findIndex((q) => q.id === active.id);
    const to = questions.findIndex((q) => q.id === over.id);
    store.getState().move(from, to);
  }

  function remove(question: Question, index: number) {
    store.getState().remove(question.id);
    toast("Soal dihapus", {
      action: { label: "Batalkan", onClick: () => store.getState().restore(question, index) },
    });
  }

  return (
    <nav aria-label="Daftar soal" className="flex min-h-0 flex-col gap-3 p-3">
      <AddQuestionMenu
        onAdd={(type) => store.getState().addQuestion(type, store.getState().selectedId)}
      >
        <Button className="w-full" size="lg">
          <Plus /> Tambah soal
        </Button>
      </AddQuestionMenu>
      <QuestionBankButton />
      <AiGenerateButton />

      <div className="flex items-center justify-between px-1 text-xs font-medium text-fg-subtle">
        <span>{questions.length} soal</span>
        <span className="hidden lg:inline">Seret untuk mengurutkan</span>
      </div>

      {questions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-4 text-center text-sm text-fg-subtle">
          Belum ada soal. Mulai dengan “Tambah soal”.
        </p>
      ) : (
        <DndContext
          id="question-list"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            <ol className="flex flex-col gap-2 overflow-y-auto pb-2">
              {questions.map((question, index) => (
                <QuestionListItem
                  key={question.id}
                  question={question}
                  index={index}
                  selected={question.id === selectedId}
                  hasIssues={showIssues && validateQuestion(question).length > 0}
                  onSelect={() => store.getState().select(question.id)}
                  onDuplicate={() => store.getState().duplicate(question.id)}
                  onRemove={() => remove(question, index)}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      )}
    </nav>
  );
}

function QuestionListItem({
  question,
  index,
  selected,
  hasIssues,
  onSelect,
  onDuplicate,
  onRemove,
}: {
  question: Question;
  index: number;
  selected: boolean;
  hasIssues: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: question.id,
  });
  const { Icon } = questionUI[question.type];

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative flex items-stretch overflow-hidden rounded-xl border-2 bg-surface shadow-card transition-colors",
        selected ? "border-accent" : "border-line hover:border-line-strong",
        isDragging && "z-10 opacity-80 shadow-pop",
      )}
    >
      <button
        type="button"
        className="flex w-5 shrink-0 cursor-grab items-center justify-center bg-surface-muted text-fg-subtle active:cursor-grabbing"
        aria-label={`Pindahkan soal ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3.5" />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 px-2.5 py-2.5 text-left"
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold",
            selected ? "bg-accent text-on-accent" : "bg-surface-muted text-fg-muted",
          )}
        >
          {index + 1}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              question.prompt.trim() ? "text-fg" : "text-fg-subtle italic",
            )}
          >
            {question.prompt.trim() || "Soal tanpa pertanyaan"}
          </span>
          <span className="flex items-center gap-1 text-xs text-fg-subtle">
            <Icon className="size-3.5" />
            {questionDefinitions[question.type].label}
          </span>
        </span>
        {hasIssues && (
          <CircleAlert className="ml-auto size-4 shrink-0 text-danger" aria-label="Ada masalah" />
        )}
      </button>
      <div className="absolute top-1 right-1 flex gap-0.5 rounded-lg bg-surface opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Tooltip content="Duplikat (Ctrl+D)">
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onDuplicate}
            aria-label={`Duplikat soal ${index + 1}`}
          >
            <Copy />
          </Button>
        </Tooltip>
        <Tooltip content="Hapus">
          <Button
            variant="ghost"
            size="icon"
            className="size-7 hover:text-danger"
            onClick={onRemove}
            aria-label={`Hapus soal ${index + 1}`}
          >
            <Trash2 />
          </Button>
        </Tooltip>
      </div>
    </li>
  );
}
