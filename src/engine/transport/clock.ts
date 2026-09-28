/**
 * Clock sync (P5-03). The device clock can be minutes off; timers must follow the
 * server. Each ping gives serverNow − (the midpoint of send and receive): assuming the
 * trip there and back took equally long, that's how far the server is ahead. The
 * median of a few pings shrugs off one slow request.
 */

export type ClockSample = { sentAt: number; receivedAt: number; serverNow: number };

export function sampleOffset({ sentAt, receivedAt, serverNow }: ClockSample): number {
  return serverNow - (sentAt + receivedAt) / 2;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Offset from several samples; the samples with the shortest trips are the most exact. */
export function clockOffset(samples: ClockSample[]): number {
  if (samples.length === 0) return 0;
  const fastest = [...samples]
    .sort((a, b) => a.receivedAt - a.sentAt - (b.receivedAt - b.sentAt))
    .slice(0, Math.max(3, Math.ceil(samples.length / 2)));
  return Math.round(median(fastest.map(sampleOffset)));
}

/** Ping `/api/time` a few times, one after another. */
export async function measureClockOffset(
  ping: () => Promise<number>,
  count = 5,
  now: () => number = Date.now,
): Promise<number> {
  const samples: ClockSample[] = [];
  for (let i = 0; i < count; i++) {
    const sentAt = now();
    try {
      const serverNow = await ping();
      samples.push({ sentAt, receivedAt: now(), serverNow });
    } catch {
      // A failed ping just doesn't count.
    }
  }
  return clockOffset(samples);
}

/** Milliseconds until `iso` on the server's clock (never negative). */
export function msUntil(iso: string | null, offsetMs: number, now = Date.now()): number | null {
  if (!iso) return null;
  return Math.max(0, Date.parse(iso) - (now + offsetMs));
}
