"use client";

import { CircleAlert, CloudCheck, CloudOff, LoaderCircle } from "lucide-react";

import { cn } from "@/lib/cn";

import { useEditor } from "./EditorContext";

const LABELS = {
  saved: "Tersimpan",
  dirty: "Menyimpan…",
  saving: "Menyimpan…",
  error: "Gagal menyimpan, mencoba lagi…",
  conflict: "Diubah di tempat lain",
} as const;

export function SaveIndicator() {
  const status = useEditor((s) => s.status);
  const Icon =
    status === "saved"
      ? CloudCheck
      : status === "error"
        ? CloudOff
        : status === "conflict"
          ? CircleAlert
          : LoaderCircle;

  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-1.5 text-xs whitespace-nowrap",
        status === "error" || status === "conflict" ? "text-danger" : "text-fg-subtle",
      )}
    >
      <Icon
        className={cn("size-4", (status === "saving" || status === "dirty") && "animate-spin")}
      />
      <span className="hidden sm:inline">{LABELS[status]}</span>
    </span>
  );
}
