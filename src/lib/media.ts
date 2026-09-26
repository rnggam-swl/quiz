/** Upload rules for question media — mirrors the `quiz-media` bucket allowlist (supabase/migrations). */
export const MEDIA_RULES = {
  image: {
    types: ["image/png", "image/jpeg", "image/webp", "image/gif"],
    maxBytes: 5 * 1024 * 1024,
  },
  audio: {
    types: ["audio/mpeg", "audio/mp4", "audio/ogg", "audio/wav", "audio/webm"],
    maxBytes: 10 * 1024 * 1024,
  },
} as const;

export const MEDIA_ACCEPT = [...MEDIA_RULES.image.types, ...MEDIA_RULES.audio.types].join(",");

export type MediaKind = keyof typeof MEDIA_RULES;

export function mediaKindOf(mimeType: string): MediaKind | null {
  if ((MEDIA_RULES.image.types as readonly string[]).includes(mimeType)) return "image";
  if ((MEDIA_RULES.audio.types as readonly string[]).includes(mimeType)) return "audio";
  return null;
}

/** Human-readable reason a file can't be uploaded, or null when it's fine. */
export function checkMediaFile(file: { type: string; size: number }): string | null {
  const kind = mediaKindOf(file.type);
  if (!kind)
    return "Format tidak didukung. Pakai PNG, JPG, WebP, GIF, MP3, M4A, OGG, WAV, atau WebM.";
  const { maxBytes } = MEDIA_RULES[kind];
  if (file.size > maxBytes) {
    return `${kind === "image" ? "Gambar" : "Audio"} maksimal ${maxBytes / 1024 / 1024} MB.`;
  }
  return null;
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/webm": "webm",
};

/** Storage path `{ownerId}/{quizId}/{uuid}.{ext}` — the folder is what the bucket policy checks. */
export function mediaPath(ownerId: string, quizId: string, mimeType: string): string {
  return `${ownerId}/${quizId}/${crypto.randomUUID()}.${EXTENSIONS[mimeType] ?? "bin"}`;
}
