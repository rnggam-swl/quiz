"use client";

import { useState } from "react";

import { toast } from "@/components/ui/Toast";
import { checkMediaFile, mediaKindOf, type MediaKind } from "@/lib/media";
import type { MediaRef } from "@/questions/shared";

import { useEditor, useEditorContext } from "./EditorContext";

/** Upload a file for the quiz being edited; errors become toasts and resolve to null. */
export function useMediaUpload() {
  const { adapter } = useEditorContext();
  const quizId = useEditor((s) => s.quiz.id);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File, only?: MediaKind): Promise<MediaRef | null> {
    const problem = checkMediaFile(file);
    if (problem) {
      toast.error(problem);
      return null;
    }
    if (only && mediaKindOf(file.type) !== only) {
      toast.error(only === "image" ? "Pilih file gambar." : "Pilih file audio.");
      return null;
    }
    setUploading(true);
    try {
      return await adapter.uploadMedia(file, quizId);
    } catch {
      toast.error("Gagal mengunggah file. Coba lagi.");
      return null;
    } finally {
      setUploading(false);
    }
  }

  return { upload, uploading };
}
