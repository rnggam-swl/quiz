"use client";

import { ImagePlus, LoaderCircle, Music, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { MEDIA_ACCEPT } from "@/lib/media";
import type { MediaRef } from "@/questions/shared";

import { useMediaUpload } from "./useMediaUpload";

const MAX_MEDIA = 4;

export function MediaField({
  media,
  onChange,
}: {
  media: MediaRef[];
  onChange: (media: MediaRef[]) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { upload, uploading } = useMediaUpload();

  async function add(file: File) {
    const ref = await upload(file);
    if (ref) onChange([...media, ref]);
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
              if (file) void add(file);
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
