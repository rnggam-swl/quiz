import { exportJWK, exportPKCS8, generateKeyPair, jwtVerify, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { LTI } from "./claims";
import { signDeepLinkResponse, verifyIdToken } from "./server";

// The tool key comes from lti_keys; here that's one row made in beforeAll.
const toolRow = vi.hoisted(() => ({ kid: "tool-1", private_pem: "" }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        order: () => chain,
        limit: () => chain,
        maybeSingle: async () => ({ data: toolRow }),
      };
      return chain;
    },
  }),
}));

const platform = {
  issuer: "https://lms.sekolah.id",
  client_id: "abc123",
  jwks_url: "https://lms.sekolah.id/mod/lti/certs.php",
};

let lmsKey: CryptoKey;
let lmsJwk: JWK;
let strangerKey: CryptoKey;
let toolPublic: CryptoKey;

beforeAll(async () => {
  const lms = await generateKeyPair("RS256", { extractable: true });
  lmsKey = lms.privateKey;
  lmsJwk = { ...(await exportJWK(lms.publicKey)), kid: "lms-1", alg: "RS256" };
  strangerKey = (await generateKeyPair("RS256")).privateKey;
  const tool = await generateKeyPair("RS256", { extractable: true });
  toolRow.private_pem = await exportPKCS8(tool.privateKey);
  toolPublic = tool.publicKey;
});

afterEach(() => vi.unstubAllGlobals());

function serveJwks() {
  const fetch = vi.fn(async () => Response.json({ keys: [lmsJwk] }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const idToken = (
  key: CryptoKey,
  claims: Record<string, unknown> = {},
  { aud = platform.client_id, kid = "lms-1" } = {},
) =>
  new SignJWT({ nonce: "n-1", [LTI.version]: "1.3.0", ...claims })
    .setProtectedHeader({ alg: "RS256", kid })
    .setIssuer(platform.issuer)
    .setAudience(aud)
    .setSubject("user-42")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(key);

describe("verifyIdToken", () => {
  it("accepts a token the LMS signed for us with our nonce", async () => {
    const fetch = serveJwks();
    const claims = await verifyIdToken(await idToken(lmsKey), platform, "n-1");
    expect(claims).toMatchObject({ sub: "user-42", [LTI.version]: "1.3.0" });
    // The platform's keys, without following redirects.
    expect(fetch).toHaveBeenCalledWith(
      platform.jwks_url,
      expect.objectContaining({ method: "GET", redirect: "manual" }),
    );
  });

  it.each([
    ["another nonce (replay)", async () => idToken(lmsKey), "n-2"],
    ["another client", async () => idToken(lmsKey, {}, { aud: "someone-else" }), "n-1"],
    ["a key the LMS doesn't publish", async () => idToken(strangerKey), "n-1"],
    [
      "several audiences without azp",
      async () => idToken(lmsKey, {}, { aud: [platform.client_id, "x"] as never }),
      "n-1",
    ],
    [
      "HS256",
      async () =>
        new SignJWT({ nonce: "n-1" })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuer(platform.issuer)
          .setAudience(platform.client_id)
          .setIssuedAt()
          .setExpirationTime("5m")
          .sign(new TextEncoder().encode("a-shared-secret-that-is-long-enough")),
      "n-1",
    ],
  ])("refuses %s", async (_, make, nonce) => {
    serveJwks();
    expect(await verifyIdToken(await make(), platform, nonce)).toBeNull();
  });
});

describe("signDeepLinkResponse", () => {
  it("signs with the tool key, verifiable from the JWKS", async () => {
    const jwt = await signDeepLinkResponse({ iss: "abc123", aud: platform.issuer });
    const { payload, protectedHeader } = await jwtVerify(jwt, toolPublic, {
      issuer: "abc123",
      audience: platform.issuer,
    });
    expect(protectedHeader).toMatchObject({ alg: "RS256", kid: "tool-1" });
    expect(payload.exp! - payload.iat!).toBe(300);
  });
});
