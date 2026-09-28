import "server-only";

import { createECDH, hkdfSync } from "node:crypto";

import { getParticipantTokenSecret } from "@/lib/env.server";

import { importSigningKey, toBase64Url, type LivePublicKey } from "./signing";

/**
 * The key pair that signs live broadcasts, derived from PARTICIPANT_TOKEN_SECRET (HKDF
 * with its own label, so the two uses stay independent). Deriving it means every server
 * instance has the same key without another secret to configure.
 */
export function deriveLiveKeyPair(secret: string): LivePublicKey & { d: string } {
  for (let i = 0; i < 16; i++) {
    const d = Buffer.from(hkdfSync("sha256", secret, "", `live-state-signing-v1:${i}`, 32));
    const ecdh = createECDH("prime256v1");
    try {
      ecdh.setPrivateKey(d);
    } catch {
      continue; // Outside the curve order (about 1 in 2^32): take the next one.
    }
    const point = ecdh.getPublicKey(); // 0x04 ‖ x ‖ y
    return {
      kty: "EC",
      crv: "P-256",
      x: toBase64Url(point.subarray(1, 33)),
      y: toBase64Url(point.subarray(33, 65)),
      d: toBase64Url(d),
    };
  }
  throw new Error("Could not derive a live signing key.");
}

let cached: { secret: string; publicKey: LivePublicKey; privateKey: Promise<CryptoKey> } | null =
  null;

function keys() {
  const secret = getParticipantTokenSecret();
  if (cached?.secret !== secret) {
    const jwk = deriveLiveKeyPair(secret);
    cached = {
      secret,
      publicKey: { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
      privateKey: importSigningKey(jwk),
    };
  }
  return cached;
}

/** Given to the phones (it's public) so they can check what the server broadcast. */
export function livePublicKey(): LivePublicKey {
  return keys().publicKey;
}

export function liveSigningKey(): Promise<CryptoKey> {
  return keys().privateKey;
}
