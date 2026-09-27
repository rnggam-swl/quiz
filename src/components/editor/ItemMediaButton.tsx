"use client";

import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { useRef } from "react";

import { Button } from "@/components/ui/Button";
import { MEDIA_RULES } from "@/lib/media";
import type { MediaRef } from "@/questions/shared";

import { useMediaUpload } from "./useMediaUpload";

/**
 * Attach a picture to one option/item (the prototype's `optionAttachments`).
 * Images only: players render items as buttons, and audio controls can't live inside one.
 */
export function ItemMediaButton({
  media,
  onChange,
  label,
}: {
  media?: MediaRef;
  onChange: (media: MediaRef | undefined) => void;
  /** Names the item for screen readers, e.g. "opsi 2". */
  label: string;
}) {
  const { upload, uploading } = useMediaUpload();
  const input = useRef<HTMLInputElement>(null);

  if (media) {
    return (
      <div className="relative size-9 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element -- user upload from Storage */}
        <img
          src={media.url}
          alt={`Gambar ${label}`}
          className="size-9 rounded-md border border-line bg-surface-muted object-cover"
        />
        <button
          type="button"
          onClick={() => onChange(undefined)}
          aria-label={`Hapus gambar ${label}`}
          title="Hapus gambar"
          className="absolute -top-1.5 -right-1.5 inline-flex size-5 items-center justify-center rounded-full bg-fg text-canvas shadow-card hover:bg-danger"
        >
          <X className="size-3" strokeWidth={3} />
        </button>
      </div>
    );
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={MEDIA_RULES.image.types.join(",")}
        className="sr-only"
        tabIndex={-1}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          const ref = file ? await upload(file, "image") : null;
          if (ref) onChange(ref);
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={uploading}
        onClick={() => input.current?.click()}
        aria-label={`Tambah gambar ke ${label}`}
        title="Tambah gambar"
        className="shrink-0"
      >
        {uploading ? <LoaderCircle className="animate-spin" /> : <ImagePlus />}
      </Button>
    </>
  );
}
