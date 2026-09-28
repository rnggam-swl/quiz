/**
 * Signed broadcasts (docs/09-mode-live.md#realtime). The live channel is public, so the
 * server signs the state it broadcasts with ECDSA P-256 and every phone checks the
 * signature with the public key before using it — a forged message is ignored. Web
 * Crypto on both sides (Node and every current browser), IEEE P1363 signatures.
 */

export type LivePublicKey = { kty: "EC"; crv: "P-256"; x: string; y: string };

const KEY_ALG = { name: "ECDSA", namedCurve: "P-256" } as const;
const SIGN_ALG = { name: "ECDSA", hash: "SHA-256" } as const;

export function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function signText(privateKey: CryptoKey, text: string): Promise<string> {
  const signature = await crypto.subtle.sign(SIGN_ALG, privateKey, new TextEncoder().encode(text));
  return toBase64Url(new Uint8Array(signature));
}

const verifyKeys = new Map<string, Promise<CryptoKey>>();

function verifyKey(jwk: LivePublicKey): Promise<CryptoKey> {
  const id = `${jwk.x}.${jwk.y}`;
  let key = verifyKeys.get(id);
  if (!key) {
    key = crypto.subtle.importKey("jwk", jwk, KEY_ALG, false, ["verify"]);
    verifyKeys.set(id, key);
  }
  return key;
}

/** False for a bad signature, a malformed one, or no Web Crypto (insecure http origin). */
export async function verifyText(
  jwk: LivePublicKey,
  text: string,
  signature: string,
): Promise<boolean> {
  if (typeof crypto === "undefined" || !crypto.subtle) return false;
  try {
    return await crypto.subtle.verify(
      SIGN_ALG,
      await verifyKey(jwk),
      fromBase64Url(signature),
      new TextEncoder().encode(text),
    );
  } catch {
    return false;
  }
}

/** A fresh key pair (the playground's in-memory engine; the server derives its own). */
export async function generateSigningKeys(): Promise<{
  privateKey: CryptoKey;
  publicKey: LivePublicKey;
}> {
  const pair = await crypto.subtle.generateKey(KEY_ALG, true, ["sign", "verify"]);
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    privateKey: pair.privateKey,
    publicKey: { kty: "EC", crv: "P-256", x: jwk.x!, y: jwk.y! },
  };
}

export async function importSigningKey(jwk: LivePublicKey & { d: string }): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, KEY_ALG, false, ["sign"]);
}
