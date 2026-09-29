import { beforeAll, describe, expect, it } from "vitest";

import { createRecoveryMarker, RECOVERY_TTL_S, verifyRecoveryMarker } from "./recovery";

beforeAll(() => {
  process.env.PARTICIPANT_TOKEN_SECRET = "test-secret-that-is-at-least-32-characters-long";
});

describe("password recovery marker", () => {
  const now = Date.UTC(2026, 8, 29, 8);

  it("accepts its own marker until it expires", () => {
    const marker = createRecoveryMarker("user-1", now);
    expect(verifyRecoveryMarker(marker, "user-1", now)).toBe(true);
    expect(verifyRecoveryMarker(marker, "user-1", now + (RECOVERY_TTL_S - 1) * 1000)).toBe(true);
    expect(verifyRecoveryMarker(marker, "user-1", now + RECOVERY_TTL_S * 1000)).toBe(false);
  });

  it("is bound to the user it was issued for", () => {
    expect(verifyRecoveryMarker(createRecoveryMarker("user-1", now), "user-2", now)).toBe(false);
  });

  it("rejects tampered or malformed markers", () => {
    const [, signature] = createRecoveryMarker("user-1", now).split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "user-2", exp: now / 1000 + 900 })).toString(
      "base64url",
    );
    expect(verifyRecoveryMarker(`${forged}.${signature}`, "user-2", now)).toBe(false);
    for (const bad of [undefined, "", "abc", "a.b.c", `${forged}.`]) {
      expect(verifyRecoveryMarker(bad, "user-1", now)).toBe(false);
    }
  });
});
