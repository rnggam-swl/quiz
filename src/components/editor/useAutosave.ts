"use client";

import { useCallback, useEffect, useRef } from "react";

import { createAutosaver, type Autosaver, type SaveDraftFn } from "./autosaver";
import type { EditorStore } from "./store";

/**
 * Wire an autosaver to store edits and warn before leaving with unsaved changes.
 * `saveDraft` must be stable (a Server Action reference or a memoized function).
 */
export function useAutosave(store: EditorStore, saveDraft: SaveDraftFn) {
  const saverRef = useRef<Autosaver | null>(null);

  useEffect(() => {
    const saver = createAutosaver(store, saveDraft);
    saverRef.current = saver;
    const unsubscribe = store.subscribe((state, prev) => {
      if (state.edit !== prev.edit) saver.schedule();
    });
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      const { edit, savedEdit } = store.getState();
      if (edit !== savedEdit) event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      unsubscribe();
      window.removeEventListener("beforeunload", onBeforeUnload);
      saver.dispose();
      if (saverRef.current === saver) saverRef.current = null;
    };
  }, [store, saveDraft]);

  const saveNow = useCallback(() => saverRef.current?.saveNow() ?? Promise.resolve(false), []);
  return { saveNow };
}
