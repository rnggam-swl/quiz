import { describe, expect, it } from "vitest";

import { escapeLike, timeAgo } from "./format";

describe("timeAgo", () => {
  const now = new Date("2026-09-26T12:00:00Z");

  it("describes recent moments in Indonesian", () => {
    expect(timeAgo(new Date("2026-09-26T11:59:40Z"), now)).toBe("baru saja");
    expect(timeAgo(new Date("2026-09-26T09:00:00Z"), now)).toBe("3 jam yang lalu");
    expect(timeAgo(new Date("2026-09-25T12:00:00Z"), now)).toBe("kemarin");
  });
});

describe("escapeLike", () => {
  it("escapes wildcards and backslashes", () => {
    expect(escapeLike("100%_\\")).toBe("100\\%\\_\\\\");
    expect(escapeLike("kuis ipa")).toBe("kuis ipa");
  });
});
