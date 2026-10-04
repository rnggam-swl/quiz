import { createStore } from "zustand";

import {
  changeQuestionType,
  createQuestion,
  duplicateQuestion,
  type Question,
} from "@/questions/question";
import type { QuestionType } from "@/questions/registry";

import type { EditorInitialState, QuizDraft } from "./types";

export type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

type QuestionPatch = Partial<Omit<Question, "id" | "type" | "config">>;

export type EditorState = EditorInitialState & {
  selectedId: string | null;
  status: SaveStatus;
  /** Bumped on every content edit; autosave compares it with `savedEdit`. */
  edit: number;
  /** The `edit` value included in the last successful save. */
  savedEdit: number;
  /** When the user asked to see publish problems, highlight invalid fields. */
  showIssues: boolean;

  setQuiz: (patch: Partial<Omit<QuizDraft, "id">>) => void;
  addQuestion: (type: QuestionType, afterId?: string | null) => string;
  /** Add imported questions at the end (P8-13). */
  appendQuestions: (questions: Question[]) => void;
  updateQuestion: (id: string, patch: QuestionPatch) => void;
  updateConfig: (id: string, config: unknown) => void;
  changeType: (id: string, type: QuestionType) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  /** Put a question back at `index` (undo delete). */
  restore: (question: Question, index: number) => void;
  move: (fromIndex: number, toIndex: number) => void;
  select: (id: string | null) => void;
  setShowIssues: (show: boolean) => void;

  markSaving: () => void;
  markSaved: (revision: number, edit: number) => void;
  markError: () => void;
  markConflict: () => void;
  markPublished: (version: number, revision: number, slug: string) => void;
};

export type EditorStore = ReturnType<typeof createEditorStore>;

export function createEditorStore(initial: EditorInitialState) {
  return createStore<EditorState>()((set, get) => {
    /** Apply a content change and mark the draft dirty. */
    const edit = (fn: (s: EditorState) => Partial<EditorState>) =>
      set((s) => ({
        ...fn(s),
        edit: s.edit + 1,
        status: s.status === "conflict" ? "conflict" : "dirty",
      }));

    const mapQuestion = (id: string, fn: (q: Question) => Question) =>
      edit((s) => ({ questions: s.questions.map((q) => (q.id === id ? fn(q) : q)) }));

    return {
      ...initial,
      selectedId: initial.questions[0]?.id ?? null,
      status: "saved",
      edit: 0,
      savedEdit: 0,
      showIssues: false,

      setQuiz: (patch) => edit((s) => ({ quiz: { ...s.quiz, ...patch } })),

      addQuestion: (type, afterId) => {
        const question = createQuestion(type);
        edit((s) => {
          const at = afterId
            ? s.questions.findIndex((q) => q.id === afterId) + 1
            : s.questions.length;
          const questions = [...s.questions];
          questions.splice(at <= 0 ? s.questions.length : at, 0, question);
          return { questions, selectedId: question.id };
        });
        return question.id;
      },

      appendQuestions: (added) => {
        if (added.length === 0) return;
        edit((s) => ({ questions: [...s.questions, ...added], selectedId: added[0]!.id }));
      },

      updateQuestion: (id, patch) => mapQuestion(id, (q) => ({ ...q, ...patch })),

      updateConfig: (id, config) => mapQuestion(id, (q) => ({ ...q, config })),

      changeType: (id, type) => mapQuestion(id, (q) => changeQuestionType(q, type)),

      duplicate: (id) =>
        edit((s) => {
          const index = s.questions.findIndex((q) => q.id === id);
          if (index < 0) return {};
          const copy = duplicateQuestion(s.questions[index]!);
          const questions = [...s.questions];
          questions.splice(index + 1, 0, copy);
          return { questions, selectedId: copy.id };
        }),

      remove: (id) =>
        edit((s) => {
          const index = s.questions.findIndex((q) => q.id === id);
          const questions = s.questions.filter((q) => q.id !== id);
          const selectedId =
            s.selectedId === id
              ? (questions[Math.min(index, questions.length - 1)]?.id ?? null)
              : s.selectedId;
          return { questions, selectedId };
        }),

      restore: (question, index) =>
        edit((s) => {
          if (s.questions.some((q) => q.id === question.id)) return {};
          const questions = [...s.questions];
          questions.splice(Math.min(index, questions.length), 0, question);
          return { questions, selectedId: question.id };
        }),

      move: (from, to) => {
        const { questions } = get();
        if (
          from === to ||
          from < 0 ||
          to < 0 ||
          from >= questions.length ||
          to >= questions.length
        ) {
          return;
        }
        edit((s) => {
          const next = [...s.questions];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved!);
          return { questions: next };
        });
      },

      select: (id) => set({ selectedId: id }),
      setShowIssues: (showIssues) => set({ showIssues }),

      markSaving: () => set({ status: "saving" }),
      markSaved: (revision, savedEdit) =>
        set((s) => ({
          revision,
          savedEdit,
          status: s.edit === savedEdit ? "saved" : "dirty",
        })),
      markError: () => set({ status: "error" }),
      markConflict: () => set({ status: "conflict" }),
      markPublished: (latestVersion, publishedRevision, slug) =>
        set({ latestVersion, publishedRevision, slug }),
    };
  });
}

/** True when the saved draft differs from the published version (or was never published). */
export function hasUnpublishedChanges(
  s: Pick<EditorState, "revision" | "publishedRevision" | "edit" | "savedEdit">,
) {
  return (
    s.publishedRevision === null || s.revision !== s.publishedRevision || s.edit !== s.savedEdit
  );
}
