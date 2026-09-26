import { describe, expect, it } from "vitest";

import { embedOriginsSchema, frameAncestors, normalizeOrigin } from "./embed-origins";

describe("normalizeOrigin", () => {
  it.each([
    ["https://Sekolah.ID", "https://sekolah.id"],
    ["https://blog.example.com/", "https://blog.example.com"],
    ["https://lms.example.com:8443", "https://lms.example.com:8443"],
    ["http://localhost:5500", "http://localhost:5500"],
    ["  https://a.test  ", "https://a.test"],
  ])("accepts %j", (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each([
    "http://sekolah.id",
    "https://sekolah.id/kelas",
    "https://sekolah.id?x=1",
    "https://user:pw@sekolah.id",
    "javascript:alert(1)",
    "sekolah.id",
    "*",
    "https://a.test; script-src *",
  ])("rejects %j", (input) => {
    expect(normalizeOrigin(input)).toBeNull();
  });
});

describe("embedOriginsSchema", () => {
  it("normalizes, drops blanks and duplicates", () => {
    expect(embedOriginsSchema.parse(["https://A.test/", "", "https://a.test"])).toEqual([
      "https://a.test",
    ]);
  });

  it("rejects the whole list if one entry is invalid", () => {
    const result = embedOriginsSchema.safeParse(["https://a.test", "ftp://b.test"]);
    expect(result.success).toBe(false);
  });
});

describe("frameAncestors", () => {
  it("always allows self and never lets junk into the header", () => {
    expect(frameAncestors([])).toBe("frame-ancestors 'self'");
    expect(frameAncestors(["https://a.test", "https://b.test; script-src *"])).toBe(
      "frame-ancestors 'self' https://a.test",
    );
  });
});
