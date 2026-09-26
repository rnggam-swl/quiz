import { z } from "zod";

export const NICKNAME_MAX = 24;

// A small starter list (Indonesian + English). It catches the obvious cases in a
// classroom; hosts can still remove participants. Extend as reports come in.
// Short words ("asu", "babi") are left out on purpose: they hit real names
// like "Asuka" (the Scunthorpe problem).
const BLOCKED = [
  "anjing",
  "anjir",
  "bangsat",
  "bajingan",
  "kontol",
  "memek",
  "ngentot",
  "tolol",
  "goblok",
  "jancok",
  "fuck",
  "shit",
  "bitch",
  "porn",
];

const LEET: Record<string, string> = {
  "0": "o",
  "1": "i",
  "3": "e",
  "4": "a",
  "5": "s",
  "7": "t",
  "@": "a",
  $: "s",
};

/** Lowercase, strip accents and punctuation, undo simple leetspeak: "B@ngs4t!" → "bangsat". */
function squash(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]/g, "");
}

export function isBlockedNickname(nickname: string): boolean {
  const squashed = squash(nickname);
  return BLOCKED.some((word) => squashed.includes(word));
}

export const nicknameSchema = z
  .string()
  .transform((s) => s.normalize("NFKC").replace(/\s+/g, " ").trim())
  .pipe(
    z
      .string()
      .min(1, "Nama panggilan wajib diisi.")
      .max(NICKNAME_MAX, `Maksimal ${NICKNAME_MAX} karakter.`)
      .refine((s) => !isBlockedNickname(s), "Pakai nama panggilan yang lain, ya."),
  );
