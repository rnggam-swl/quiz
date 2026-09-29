import { isIP } from "node:net";

// Webhook URLs point at someone else's server, and we fetch them from ours. Refuse local
// and private addresses so a webhook can't be aimed at our own network (SSRF). Checked
// when saving (the hostname) and again before every delivery (the resolved addresses).

/**
 * Local receivers (http://localhost) are fine while developing, and in E2E runs that set
 * WEBHOOKS_ALLOW_LOCAL=true. Never set that in production.
 */
export const allowLocalWebhooks =
  process.env.NODE_ENV !== "production" || process.env.WEBHOOKS_ALLOW_LOCAL === "true";

const BLOCKED_HOSTS = /(^|\.)(localhost|local|internal|localdomain|home\.arpa)$/i;

function ipv4Parts(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
    ? parts
    : null;
}

/** Loopback, private, link-local, CGNAT, multicast, reserved… anything not on the internet. */
export function isPrivateAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  const v4 = ipv4Parts(mapped?.[1] ?? ip);
  if (v4) {
    const [a, b] = v4 as [number, number, number, number];
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  return (
    v6 === "::" ||
    v6 === "::1" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe8") ||
    v6.startsWith("fe9") ||
    v6.startsWith("fea") ||
    v6.startsWith("feb") ||
    v6.startsWith("ff") ||
    v6.startsWith("64:ff9b:") ||
    v6.startsWith("2001:db8")
  );
}

export type UrlCheck = { ok: true; url: URL } | { ok: false; error: string };

/**
 * A webhook URL we're willing to call. `allowLocal` (development only) lets people test
 * with a receiver on their own machine.
 */
export function checkWebhookUrl(raw: string, { allowLocal = false } = {}): UrlCheck {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { ok: false, error: "URL tidak valid." };
  }
  if (raw.trim().length > 500) return { ok: false, error: "URL terlalu panjang." };
  if (url.username || url.password) return { ok: false, error: "URL tidak boleh berisi login." };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const local = BLOCKED_HOSTS.test(host) || (isIP(host) !== 0 && isPrivateAddress(host));
  if (local) {
    if (allowLocal && url.protocol === "http:") return { ok: true, url };
    if (!allowLocal) return { ok: false, error: "Alamat lokal atau privat tidak bisa dipakai." };
  }
  if (url.protocol !== "https:" && !(allowLocal && url.protocol === "http:")) {
    return { ok: false, error: "Gunakan https://." };
  }
  return { ok: true, url };
}
