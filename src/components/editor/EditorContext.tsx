"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useStore } from "zustand";

import type { EditorState, EditorStore } from "./store";
import type { EditorAdapter } from "./types";

type EditorContextValue = {
  store: EditorStore;
  adapter: EditorAdapter;
  /** Flush pending edits; resolves true when the draft is fully saved. */
  saveNow: () => Promise<boolean>;
};

const EditorContext = createContext<EditorContextValue | null>(null);

export function EditorProvider({
  value,
  children,
}: {
  value: EditorContextValue;
  children: ReactNode;
}) {
  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditorContext(): EditorContextValue {
  const value = useContext(EditorContext);
  if (!value) throw new Error("useEditorContext must be used inside <EditorProvider>");
  return value;
}

/** Subscribe to a slice of editor state. Return primitives or stable references from `selector`. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorContext().store, selector);
}
