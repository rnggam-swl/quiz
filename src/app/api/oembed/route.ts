import { NextResponse, type NextRequest } from "next/server";

import { isSessionOpen, loadDefaultSessionBySlug } from "@/engine/practice/server";
import { oembedIframe, oembedSize, parseOembedUrl } from "@/lib/oembed";
import { site } from "@/lib/site";

// oEmbed provider (P8-09, docs/07-embed.md#oembed--wordpress). Public and read-only: it only
// answers for quizzes whose owner switched embedding on, with what /embed/[slug] shows anyway.

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=300",
};

function fail(status: 404 | 501, message: string) {
  return new NextResponse(message, { status, headers: HEADERS });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const format = searchParams.get("format");
  if (format && format !== "json") return fail(501, "Only format=json is supported.");

  const target = parseOembedUrl(searchParams.get("url"), origin);
  if (!target) return fail(404, "Not an embeddable quiz link.");

  const ctx = await loadDefaultSessionBySlug(target.slug);
  if (
    !ctx ||
    !ctx.policy.allowEmbed ||
    ctx.quiz.embed_allowed_origins.length === 0 ||
    !isSessionOpen(ctx)
  ) {
    return fail(404, "Quiz not found or not embeddable.");
  }

  const title = ctx.snapshot.quiz.title || "Quiz";
  const { width, height } = oembedSize(searchParams.get("maxwidth"), searchParams.get("maxheight"));
  return NextResponse.json(
    {
      version: "1.0",
      type: "rich",
      provider_name: site.name,
      provider_url: origin,
      title,
      width,
      height,
      cache_age: 300,
      html: oembedIframe({ appOrigin: origin, target, title, height }),
    },
    { headers: HEADERS },
  );
}
