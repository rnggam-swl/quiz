import { describe, expect, it } from "vitest";

import {
  EMBED_TOKEN_MAX_TTL_S,
  generateEmbedSecret,
  signEmbedToken,
  verifyEmbedToken,
} from "./embed-token";
import {
  PARTICIPANT_TOKEN_TTL_S,
  signParticipantToken,
  verifyParticipantToken,
} from "./participant-token";
import { b64url, hmacSha256 } from "./signed-token";

const SECRET = "x".repeat(40);
const ids = { participantId: crypto.randomUUID(), sessionId: crypto.randomUUID() };

describe("participant token", () => {
  it("round-trips its claims", () => {
    const now = Date.UTC(2026, 8, 26);
    const token = signParticipantToken(SECRET, ids, now);
    expect(token.startsWith("pt1.")).toBe(true);
    expect(verifyParticipantToken(SECRET, token, now)).toEqual({
      ...ids,
      expiresAt: now / 1000 + PARTICIPANT_TOKEN_TTL_S,
    });
  });

  it("rejects a token signed with another secret", () => {
    const token = signParticipantToken("y".repeat(40), ids);
    expect(verifyParticipantToken(SECRET, token)).toBeNull();
  });

  it("rejects a tampered payload", () => {
    const [prefix, , signature] = signParticipantToken(SECRET, ids).split(".");
    const forged = b64url(JSON.stringify({ p: crypto.randomUUID(), s: ids.sessionId, exp: 9e9 }));
    expect(verifyParticipantToken(SECRET, `${prefix}.${forged}.${signature}`)).toBeNull();
  });

  it("rejects expired, malformed and empty tokens", () => {
    const now = Date.now();
    const token = signParticipantToken(SECRET, ids, now);
    expect(
      verifyParticipantToken(SECRET, token, now + (PARTICIPANT_TOKEN_TTL_S + 1) * 1000),
    ).toBeNull();
    for (const bad of ["", null, undefined, "pt1", "pt1.a.b.c", "jwt.a.b", "x".repeat(2000)]) {
      expect(verifyParticipantToken(SECRET, bad)).toBeNull();
    }
  });

  it("rejects a correctly signed payload with the wrong shape", () => {
    const payload = b64url(JSON.stringify({ p: "not-a-uuid", s: ids.sessionId, exp: 9e9 }));
    const sig = b64url(hmacSha256(SECRET, `pt1.${payload}`));
    expect(verifyParticipantToken(SECRET, `pt1.${payload}.${sig}`)).toBeNull();
  });
});

describe("embed token", () => {
  const secret = generateEmbedSecret();
  const now = Date.UTC(2026, 8, 26, 12);
  const exp = now / 1000 + 600;

  it("generates 256-bit secrets", () => {
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(generateEmbedSecret()).not.toBe(secret);
  });

  it("accepts a valid HS256 token for the right quiz", () => {
    const token = signEmbedToken(secret, { sub: "user-123", name: "Budi", quiz: "kuis-a", exp });
    expect(verifyEmbedToken(secret, token, "kuis-a", now)).toEqual({
      ok: true,
      claims: { externalId: "user-123", name: "Budi" },
    });
  });

  it("rejects wrong secret, wrong quiz, expired and over-long tokens", () => {
    const token = signEmbedToken(secret, { sub: "u", quiz: "kuis-a", exp });
    expect(verifyEmbedToken(generateEmbedSecret(), token, "kuis-a", now)).toEqual({
      ok: false,
      error: "signature",
    });
    expect(verifyEmbedToken(secret, token, "kuis-b", now)).toEqual({
      ok: false,
      error: "wrong_quiz",
    });
    expect(verifyEmbedToken(secret, token, "kuis-a", (exp + 120) * 1000)).toEqual({
      ok: false,
      error: "expired",
    });
    const tooLong = signEmbedToken(secret, {
      sub: "u",
      quiz: "kuis-a",
      exp: now / 1000 + EMBED_TOKEN_MAX_TTL_S * 24,
    });
    expect(verifyEmbedToken(secret, tooLong, "kuis-a", now)).toEqual({
      ok: false,
      error: "too_long",
    });
  });

  it("refuses alg=none and other algorithms", () => {
    const payload = b64url(JSON.stringify({ sub: "u", quiz: "kuis-a", exp }));
    const none = `${b64url(JSON.stringify({ alg: "none" }))}.${payload}.`;
    expect(verifyEmbedToken(secret, none, "kuis-a", now)).toEqual({
      ok: false,
      error: "malformed",
    });
    const rs = `${b64url(JSON.stringify({ alg: "RS256" }))}.${payload}.${b64url("sig")}`;
    expect(verifyEmbedToken(secret, rs, "kuis-a", now)).toEqual({ ok: false, error: "malformed" });
  });
});
