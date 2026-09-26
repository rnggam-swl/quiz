import { createHmac, timingSafeEqual } from "node:crypto";

/** base64url without padding. */
export function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

export function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export function hmacSha256(secret: string, data: string): Buffer {
  return createHmac("sha256", secret).update(data).digest();
}

/** Constant-time comparison of two signatures. */
export function signaturesMatch(expected: Buffer, actual: Buffer): boolean {
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function parseJson(buffer: Buffer): unknown {
  try {
    return JSON.parse(buffer.toString("utf8"));
  } catch {
    return null;
  }
}
