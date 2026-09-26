import { describe, expect, it } from "vitest";

import { checkMediaFile, mediaKindOf, mediaPath } from "./media";

const MB = 1024 * 1024;

describe("media rules", () => {
  it("classifies allowed types", () => {
    expect(mediaKindOf("image/png")).toBe("image");
    expect(mediaKindOf("audio/mpeg")).toBe("audio");
    expect(mediaKindOf("image/svg+xml")).toBeNull();
    expect(mediaKindOf("video/mp4")).toBeNull();
  });

  it("enforces 5 MB for images and 10 MB for audio", () => {
    expect(checkMediaFile({ type: "image/jpeg", size: 5 * MB })).toBeNull();
    expect(checkMediaFile({ type: "image/jpeg", size: 5 * MB + 1 })).toBe("Gambar maksimal 5 MB.");
    expect(checkMediaFile({ type: "audio/mpeg", size: 9 * MB })).toBeNull();
    expect(checkMediaFile({ type: "audio/mpeg", size: 11 * MB })).toBe("Audio maksimal 10 MB.");
  });

  it("rejects unsupported formats (e.g. SVG, which can carry scripts)", () => {
    expect(checkMediaFile({ type: "image/svg+xml", size: 100 })).toMatch(/Format tidak didukung/);
  });

  it("builds paths under the owner's folder", () => {
    expect(mediaPath("owner", "quiz", "image/webp")).toMatch(/^owner\/quiz\/[0-9a-f-]{36}\.webp$/);
  });
});
