import { z } from "zod";

export const MAX_EMBED_ORIGINS = 20;

/**
 * An origin a quiz may be embedded on: `https://host[:port]`, or `http://` for
 * localhost during development. Stored normalized (lowercase, no path/slash) so
 * it can go straight into a CSP `frame-ancestors` list.
 */
export function normalizeOrigin(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local)) return null;
  if (url.username || url.password) return null;
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return null;
  return url.origin;
}

export const embedOriginsSchema = z
  .array(z.string())
  .max(MAX_EMBED_ORIGINS)
  .transform((list, ctx) => {
    const out: string[] = [];
    for (const raw of list) {
      if (!raw.trim()) continue;
      const origin = normalizeOrigin(raw);
      if (!origin) {
        ctx.addIssue({ code: "custom", message: `Domain tidak valid: ${raw}` });
        return z.NEVER;
      }
      if (!out.includes(origin)) out.push(origin);
    }
    return out;
  });

/** CSP value for an embed page: the quiz's allowed origins, plus our own origin for previews. */
export function frameAncestors(origins: readonly string[]): string {
  const safe = origins.filter((o) => normalizeOrigin(o) === o);
  return `frame-ancestors 'self'${safe.length ? ` ${safe.join(" ")}` : ""}`;
}
