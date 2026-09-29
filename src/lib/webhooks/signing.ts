import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Webhook signatures follow Standard Webhooks (https://www.standardwebhooks.com), so
// receivers can use its libraries: headers webhook-id, webhook-timestamp and
// webhook-signature = "v1,<base64 HMAC-SHA256(key, `${id}.${timestamp}.${body}`)>", where
// the key is the base64 part of the whsec_ secret.

export const WEBHOOK_TOLERANCE_S = 5 * 60;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64")}`;
}

function key(secret: string): Buffer {
  return Buffer.from(secret.replace(/^whsec_/, ""), "base64");
}

export function signWebhook(secret: string, id: string, timestamp: number, body: string): string {
  const mac = createHmac("sha256", key(secret)).update(`${id}.${timestamp}.${body}`).digest();
  return `v1,${mac.toString("base64")}`;
}

export function webhookHeaders(
  secret: string,
  id: string,
  body: string,
  now = Date.now(),
): Record<string, string> {
  const timestamp = Math.floor(now / 1000);
  return {
    "content-type": "application/json",
    "user-agent": "QuizWebhooks/1.0",
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": signWebhook(secret, id, timestamp, body),
  };
}

/**
 * What a receiver does (docs/07-embed.md#webhook). Accepts any of the space-separated
 * signatures (secret rotation) and rejects timestamps more than 5 minutes off.
 */
export function verifyWebhook(
  secret: string,
  headers: { id: string; timestamp: string; signature: string },
  body: string,
  now = Date.now(),
): boolean {
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp) || Math.abs(now / 1000 - timestamp) > WEBHOOK_TOLERANCE_S) {
    return false;
  }
  const expected = Buffer.from(signWebhook(secret, headers.id, timestamp, body));
  return headers.signature.split(" ").some((candidate) => {
    const actual = Buffer.from(candidate);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  });
}
