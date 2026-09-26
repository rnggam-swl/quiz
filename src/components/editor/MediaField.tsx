"use client";

import { ImagePlus, LoaderCircle, Music, X } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { toast } from "@/components/ui/Toast";
import { checkMediaFile, MEDIA_ACCEPT } from "@/lib/media";
import type { MediaRef } from "@/questions/shared";

import { useEditorContext } from "./EditorContext";

const MAX_MEDIA = 4;

export function MediaField({
  quizId,
  media,
  onChange,
}: {
  quizId: string;
  media: MediaRef[];
  onChange: (media: MediaRef[]) => void;
}) {
  const { adapter } = useEditorContext();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    const problem = checkMediaFile(file);
    if (problem) {
      toast.error(problem);
      return;
    }
    setUploading(true);
    try {
      const ref = await adapter.uploadMedia(file, quizId);
      onChange([...media, ref]);
    } catch {
      toast.error("Gagal mengunggah file. Coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {media.length > 0 && (
        <ul className="flex flex-wrap gap-3">
          {media.map((item, index) => (
            <li
              key={item.url}
              className="flex w-56 flex-col gap-2 rounded-xl border border-line bg-surface p-2"
            >
              <div className="relative">
                {item.kind === "image" ? (
                  // User-uploaded media from Supabase Storage; next/image adds nothing here.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt={item.alt ?? ""}
                    className="h-32 w-full rounded-lg bg-surface-muted object-contain"
                  />
                ) : (
                  <div className="flex h-32 flex-col items-center justify-center gap-2 rounded-lg bg-surface-muted">
                    <Music className="size-6 text-fg-subtle" />
                    <audio controls src={item.url} className="w-full" />
                  </div>
                )}
                <Button
                  variant="secondary"
                  size="icon"
                  className="absolute top-1 right-1 size-7"
                  aria-label="Hapus media"
                  onClick={() => onChange(media.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </div>
              {item.kind === "image" && (
                <Input
                  value={item.alt ?? ""}
                  maxLength={300}
                  placeholder="Deskripsi gambar (alt)"
                  aria-label="Deskripsi gambar untuk pembaca layar"
                  className="h-8 text-xs"
                  onChange={(e) =>
                    onChange(media.map((m, i) => (i === index ? { ...m, alt: e.target.value } : m)))
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {media.length < MAX_MEDIA && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept={MEDIA_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) void upload(file);
            }}
          />
          <Button
            variant="secondary"
            className="self-start border-dashed"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
            {uploading ? "Mengunggah…" : "Tambah gambar / audio"}
          </Button>
        </>
      )}
    </div>
  );
}
