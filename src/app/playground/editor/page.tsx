import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PlaygroundEditor } from "./PlaygroundEditor";

export const metadata: Metadata = { title: "Editor (playground)" };

/** The real quiz editor wired to an in-memory adapter — for UI work without Supabase. */
export default function PlaygroundEditorPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PlaygroundEditor />;
}
