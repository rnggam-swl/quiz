import { describe, expect, it } from "vitest";

import {
  bearerToken,
  decodeCursor,
  encodeCursor,
  generateApiToken,
  hashApiToken,
} from "./api-token";

describe("API tokens", () => {
  it("generates distinct tokens with a visible prefix and a stored hash", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.token).toMatch(/^qz_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.prefix).toBe(a.token.slice(0, 10));
    expect(a.hash).toBe(hashApiToken(a.token));
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reads the bearer token and ignores anything else", () => {
    const { token } = generateApiToken();
    expect(bearerToken(`Bearer ${token}`)).toBe(token);
    expect(bearerToken(`bearer ${token} `)).toBe(token);
    for (const header of [
      null,
      "",
      token,
      `Basic ${token}`,
      "Bearer qz_short",
      `Bearer ${token}x`,
    ]) {
      expect(bearerToken(header)).toBeNull();
    }
  });
});

describe("cursors", () => {
  it("round-trip and reject junk", () => {
    const next = { started_at: "2026-09-29T08:00:00.123456+00:00", id: crypto.randomUUID() };
    expect(decodeCursor(encodeCursor(next))).toEqual({ startedAt: next.started_at, id: next.id });
    expect(encodeCursor(null)).toBeNull();
    for (const bad of [null, "", "!!!", Buffer.from('["x","y"]').toString("base64url")]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });
});
