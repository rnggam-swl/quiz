import { describe, expect, it } from "vitest";

import { oembedIframe, oembedSize, parseOembedUrl } from "./oembed";

const APP = "https://quiz.sekolah.id";

describe("parseOembedUrl", () => {
  it("accepts this app's embed links", () => {
    expect(parseOembedUrl(`${APP}/embed/kuis-hewan`, APP)).toEqual({
      slug: "kuis-hewan",
      theme: null,
    });
    expect(parseOembedUrl(`${APP}/embed/kuis-hewan/?theme=dark&x=1`, APP)).toEqual({
      slug: "kuis-hewan",
      theme: "dark",
    });
  });

  it.each([
    null,
    "",
    "bukan url",
    "https://lain.example/embed/kuis-hewan",
    `${APP}/play/123456`,
    `${APP}/embed/Kuis_Hewan`,
    `${APP}/embed/kuis-hewan/lagi`,
    `http://quiz.sekolah.id/embed/kuis-hewan`,
  ])("rejects %j", (url) => {
    expect(parseOembedUrl(url, APP)).toBeNull();
  });

  it("ignores unknown themes", () => {
    expect(parseOembedUrl(`${APP}/embed/a?theme=neon`, APP)?.theme).toBeNull();
  });
});

describe("oembedSize", () => {
  it("defaults, respects the consumer's maximum, and keeps a usable minimum", () => {
    expect(oembedSize(null, null)).toEqual({ width: 640, height: 600 });
    expect(oembedSize("500", "400")).toEqual({ width: 500, height: 400 });
    expect(oembedSize("2000", "2000")).toEqual({ width: 640, height: 600 });
    expect(oembedSize("100", "100")).toEqual({ width: 280, height: 360 });
    expect(oembedSize("abc", "-5")).toEqual({ width: 640, height: 600 });
  });
});

describe("oembedIframe", () => {
  it("escapes the title and keeps the theme", () => {
    const html = oembedIframe({
      appOrigin: APP,
      target: { slug: "kuis-hewan", theme: "dark" },
      title: 'Kuis "Hewan" <3',
      height: 600,
    });
    expect(html).toContain(`src="${APP}/embed/kuis-hewan?theme=dark"`);
    expect(html).toContain('title="Kuis &quot;Hewan&quot; &lt;3"');
    expect(html).toContain('height="600"');
    expect(html).not.toContain("<script");
  });
});
