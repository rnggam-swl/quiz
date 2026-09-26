import { customAlphabet } from "nanoid";

// URL-safe, no look-alike characters; 10 chars ≈ 60 bits — plenty for ids inside one quiz.
const nanoid = customAlphabet("23456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ", 10);

/** Stable id for options/items inside a question config (never array indexes — docs/04). */
export function createId(): string {
  return nanoid();
}
