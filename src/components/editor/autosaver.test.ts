import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AUTOSAVE_DELAY_MS, createAutosaver, RETRY_DELAYS_MS, type SaveDraftFn } from "./autosaver";
import { createEditorStore } from "./store";
import type { SaveDraftInput, SaveDraftResult } from "./types";

function setup(respond: (input: SaveDraftInput) => SaveDraftResult | Promise<SaveDraftResult>) {
  const store = createEditorStore({
    quiz: { id: "quiz-1", title: "Kuis", description: "", coverUrl: null, theme: {} },
    questions: [],
    revision: 0,
    publishedRevision: null,
    latestVersion: null,
    slug: null,
  });
  const calls: SaveDraftInput[] = [];
  const saveDraft: SaveDraftFn = async (input) => {
    calls.push(structuredClone(input));
    return respond(input);
  };
  const saver = createAutosaver(store, saveDraft);
  store.subscribe((s, prev) => {
    if (s.edit !== prev.edit) saver.schedule();
  });
  return { store, saver, calls };
}

const ok = (input: SaveDraftInput): SaveDraftResult => ({
  ok: true,
  revision: input.baseRevision + 1,
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("autosaver", () => {
  it("debounces a burst of edits into one save", async () => {
    const { store, calls } = setup(ok);
    store.getState().setQuiz({ title: "K" });
    store.getState().setQuiz({ title: "Ku" });
    store.getState().setQuiz({ title: "Kuis IPA" });
    expect(store.getState().status).toBe("dirty");

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.quiz.title).toBe("Kuis IPA");
    expect(store.getState()).toMatchObject({ status: "saved", revision: 1 });
  });

  it("saves edits made during an in-flight save in a follow-up save", async () => {
    let release!: () => void;
    const { store, calls } = setup(
      (input) =>
        new Promise((resolve) => {
          release = () => resolve(ok(input));
        }),
    );
    store.getState().addQuestion("true_false");
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().status).toBe("saving");

    store.getState().setQuiz({ title: "Diubah saat menyimpan" });
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().status).toBe("dirty");

    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatchObject({ baseRevision: 1, quiz: { title: "Diubah saat menyimpan" } });
    expect(store.getState()).toMatchObject({ status: "saved", revision: 2 });
  });

  it("stops saving after a revision conflict", async () => {
    const { store, calls } = setup(() => ({ ok: false, error: "conflict" }));
    store.getState().setQuiz({ title: "A" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().status).toBe("conflict");

    store.getState().setQuiz({ title: "B" });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toHaveLength(1);
    expect(store.getState().status).toBe("conflict");
  });

  it("retries failed saves with backoff", async () => {
    let fail = true;
    const { store, calls } = setup((input) => (fail ? { ok: false, error: "unknown" } : ok(input)));
    store.getState().setQuiz({ title: "A" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().status).toBe("error");

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(calls).toHaveLength(2);

    fail = false;
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[1]);
    expect(calls).toHaveLength(3);
    expect(store.getState().status).toBe("saved");
  });

  it("treats a thrown error like a failed save", async () => {
    const { store } = setup(() => Promise.reject(new Error("offline")));
    store.getState().setQuiz({ title: "A" });
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(store.getState().status).toBe("error");
  });

  it("saveNow flushes immediately and reports whether everything is saved", async () => {
    const { store, saver, calls } = setup(ok);
    expect(await saver.saveNow()).toBe(true);
    expect(calls).toHaveLength(0);

    store.getState().setQuiz({ title: "Segera" });
    expect(await saver.saveNow()).toBe(true);
    expect(calls).toHaveLength(1);
  });
});
