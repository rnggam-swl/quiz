import { describe, expect, it } from "vitest";

import { generateWebhookSecret, signWebhook, verifyWebhook, webhookHeaders } from "./signing";
import { checkWebhookUrl, isPrivateAddress } from "./url";

describe("webhook signatures (Standard Webhooks)", () => {
  const secret = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
  const now = 1_790_000_000_000;

  it("matches the Standard Webhooks reference vector", () => {
    // From the spec's test suite: msg_p5jXN8AQM9LWM0D4loKWxJek, 1614265330, {"test": 2432232314}
    expect(
      signWebhook(secret, "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, '{"test": 2432232314}'),
    ).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("signs deliveries that receivers can verify, within 5 minutes", () => {
    const body = JSON.stringify({ type: "attempt.submitted" });
    const headers = webhookHeaders(secret, "evt-1", body, now);
    const received = {
      id: headers["webhook-id"]!,
      timestamp: headers["webhook-timestamp"]!,
      signature: headers["webhook-signature"]!,
    };
    expect(verifyWebhook(secret, received, body, now + 60_000)).toBe(true);
    expect(verifyWebhook(secret, received, body, now + 6 * 60_000)).toBe(false);
    expect(verifyWebhook(secret, received, `${body} `, now)).toBe(false);
    expect(verifyWebhook(generateWebhookSecret(), received, body, now)).toBe(false);
    expect(
      verifyWebhook(secret, { ...received, signature: `v1,abc ${received.signature}` }, body, now),
    ).toBe(true);
  });

  it("generates secrets the database accepts", () => {
    expect(generateWebhookSecret()).toMatch(/^whsec_[A-Za-z0-9+/=]{32,}$/);
  });
});

describe("webhook URLs", () => {
  it.each(["https://lms.sekolah.id/hooks/quiz", "https://203.0.113.9/hook"])(
    "accepts %s",
    (url) => {
      expect(checkWebhookUrl(url).ok).toBe(true);
    },
  );

  it.each([
    "http://lms.sekolah.id/hook",
    "https://localhost/hook",
    "https://api.internal/hook",
    "https://10.0.0.5/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://[::1]/hook",
    "https://user:pass@lms.sekolah.id/hook",
    "bukan url",
  ])("refuses %s", (url) => {
    expect(checkWebhookUrl(url).ok).toBe(false);
  });

  it("allows a local http receiver only in development", () => {
    expect(checkWebhookUrl("http://localhost:4000/hook", { allowLocal: true }).ok).toBe(true);
    expect(checkWebhookUrl("http://localhost:4000/hook").ok).toBe(false);
  });

  it.each([
    ["127.0.0.1", true],
    ["10.1.2.3", true],
    ["172.20.0.1", true],
    ["192.168.1.6", true],
    ["100.100.0.1", true],
    ["::ffff:10.0.0.1", true],
    ["fd12::1", true],
    ["fe80::1", true],
    ["8.8.8.8", false],
    ["2606:4700::1111", false],
  ])("isPrivateAddress(%s) = %s", (ip, expected) => {
    expect(isPrivateAddress(ip)).toBe(expected);
  });
});
