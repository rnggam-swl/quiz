import type { EditorStore } from "./store";
import type { SaveDraftInput, SaveDraftResult } from "./types";

export const AUTOSAVE_DELAY_MS = 800;
export const RETRY_DELAYS_MS = [2_000, 4_000, 8_000, 15_000, 30_000] as const;

export type SaveDraftFn = (input: SaveDraftInput) => Promise<SaveDraftResult>;

export type Autosaver = {
  /** Save after `delay` ms, replacing any pending timer. */
  schedule: (delay?: number) => void;
  /** Save right away (Ctrl+S, before publish). Resolves true when everything is saved. */
  saveNow: () => Promise<boolean>;
  dispose: () => void;
};

/**
 * Debounced autosave with a single request in flight. Edits made while a save
 * runs are picked up by a follow-up save; failures retry with backoff; a
 * revision conflict stops saving until the page is reloaded.
 */
export function createAutosaver(store: EditorStore, saveDraft: SaveDraftFn): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<boolean> | null = null;
  let failures = 0;
  let disposed = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  function schedule(delay = AUTOSAVE_DELAY_MS) {
    if (disposed) return;
    clearTimer();
    timer = setTimeout(() => void run(), delay);
  }

  async function saveOnce(): Promise<boolean> {
    const s = store.getState();
    if (s.status === "conflict") return false;
    if (s.edit === s.savedEdit) return true;

    const editAtStart = s.edit;
    s.markSaving();
    let result: SaveDraftResult;
    try {
      result = await saveDraft({
        quizId: s.quiz.id,
        baseRevision: s.revision,
        quiz: {
          title: s.quiz.title,
          description: s.quiz.description,
          coverUrl: s.quiz.coverUrl,
          theme: s.quiz.theme,
        },
        questions: s.questions,
      });
    } catch {
      result = { ok: false, error: "unknown" };
    }

    const state = store.getState();
    if (result.ok) {
      failures = 0;
      state.markSaved(result.revision, editAtStart);
      return true;
    }
    if (result.error === "conflict" || result.error === "not_found") state.markConflict();
    else state.markError();
    return false;
  }

  async function run(): Promise<boolean> {
    clearTimer();
    // Queue behind a running save; it may not include the latest edits.
    while (inFlight) await inFlight;
    inFlight = saveOnce();
    const ok = await inFlight;
    inFlight = null;

    const after = store.getState();
    if (ok && after.edit !== after.savedEdit) schedule(AUTOSAVE_DELAY_MS);
    if (!ok && after.status === "error") {
      schedule(RETRY_DELAYS_MS[Math.min(failures, RETRY_DELAYS_MS.length - 1)]);
      failures++;
    }
    return ok && after.edit === after.savedEdit;
  }

  return {
    schedule,
    saveNow: run,
    dispose() {
      disposed = true;
      clearTimer();
    },
  };
}
