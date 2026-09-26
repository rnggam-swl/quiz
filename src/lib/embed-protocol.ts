/**
 * postMessage protocol between an embedded quiz (iframe) and the host page
 * (docs/07-embed.md#protokol-postmessage). public/embed.js implements the host
 * side; keep both in sync.
 */

export const EMBED_SOURCE = "quiz-embed";
export const HOST_SOURCE = "quiz-host";

export type EmbedToHost =
  | { type: "ready"; payload: { slug: string; title: string } }
  | { type: "resize"; payload: { height: number } }
  | { type: "started"; payload: { attemptId: string } }
  | { type: "answered"; payload: { questionIndex: number; correct?: number; total?: number } }
  | {
      type: "completed";
      payload: {
        attemptId: string;
        score: number;
        maxScore: number;
        ratio: number;
        durationMs: number;
      };
    };

export type HostToEmbed =
  | { type: "setTheme"; payload: { primary?: string; mode?: "light" | "dark" } }
  | { type: "restart"; payload: Record<string, never> };

/** Parse a message the host page sent us; anything else is ignored. */
export function parseHostMessage(data: unknown): HostToEmbed | null {
  if (!data || typeof data !== "object") return null;
  const { source, type, payload } = data as Record<string, unknown>;
  if (source !== HOST_SOURCE || typeof type !== "string") return null;
  const body = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (type === "restart") return { type, payload: {} };
  if (type === "setTheme") {
    const primary =
      typeof body.primary === "string" && /^#[0-9a-f]{6}$/i.test(body.primary)
        ? body.primary
        : undefined;
    const mode = body.mode === "light" || body.mode === "dark" ? body.mode : undefined;
    return { type, payload: { primary, mode } };
  }
  return null;
}

/**
 * The embedding page's origin, if it is on the allow list. Tries
 * location.ancestorOrigins (Chrome/Safari) then document.referrer.
 */
export function detectParentOrigin(
  allowed: readonly string[],
  ancestorOrigins: readonly string[],
  referrer: string,
): string | null {
  const candidates = [...ancestorOrigins.slice(0, 1)];
  try {
    if (referrer) candidates.push(new URL(referrer).origin);
  } catch {
    // Unparseable referrer: ignore.
  }
  return candidates.find((origin) => allowed.includes(origin)) ?? null;
}
