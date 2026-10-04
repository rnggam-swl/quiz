// oEmbed (P8-09, https://oembed.com): turns an embed link like https://{app}/embed/kuis-hewan
// into iframe HTML for WordPress, Notion, Discourse, … Pure helpers; the route is
// src/app/api/oembed/route.ts.

export const OEMBED_DEFAULT = { width: 640, height: 600 } as const;
const LIMITS = { minWidth: 280, maxWidth: 1200, minHeight: 360, maxHeight: 1200 } as const;

export type OembedTarget = { slug: string; theme: "light" | "dark" | null };

/** The quiz a URL points at, if it is one of this app's embed links. */
export function parseOembedUrl(raw: string | null, appOrigin: string): OembedTarget | null {
  if (!raw || raw.length > 2000) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.origin !== appOrigin) return null;
  const match = /^\/embed\/([a-z0-9-]{1,80})\/?$/.exec(url.pathname);
  if (!match?.[1]) return null;
  const theme = url.searchParams.get("theme");
  return { slug: match[1], theme: theme === "light" || theme === "dark" ? theme : null };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

/** Width/height within the consumer's maxwidth/maxheight (never below a usable minimum). */
export function oembedSize(maxwidth: string | null, maxheight: string | null) {
  const mw = Number(maxwidth);
  const mh = Number(maxheight);
  return {
    width: clamp(
      Number.isFinite(mw) && mw > 0 ? Math.min(mw, OEMBED_DEFAULT.width) : OEMBED_DEFAULT.width,
      LIMITS.minWidth,
      LIMITS.maxWidth,
    ),
    height: clamp(
      Number.isFinite(mh) && mh > 0 ? Math.min(mh, OEMBED_DEFAULT.height) : OEMBED_DEFAULT.height,
      LIMITS.minHeight,
      LIMITS.maxHeight,
    ),
  };
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * A plain iframe: the one thing every consumer keeps. (The embed.js loader resizes itself,
 * but consumers strip scripts; the WordPress plugin uses the loader via its shortcode.)
 */
export function oembedIframe({
  appOrigin,
  target,
  title,
  height,
}: {
  appOrigin: string;
  target: OembedTarget;
  title: string;
  height: number;
}): string {
  const src = `${appOrigin}/embed/${target.slug}${target.theme ? `?theme=${target.theme}` : ""}`;
  return (
    `<iframe src="${escapeHtml(src)}" title="${escapeHtml(title || "Quiz")}" ` +
    `width="100%" height="${height}" style="width:100%;max-width:100%;border:0;border-radius:16px" ` +
    `allow="fullscreen; autoplay" loading="lazy"></iframe>`
  );
}
