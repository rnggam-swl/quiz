/**
 * The realtime layer (docs/02-architecture.md#realtime, P5-01). Screens only see this
 * interface; today it's Supabase Realtime, and a dedicated game server could replace it
 * without touching the players.
 *
 * Anyone can send to a public channel, so nothing unverified is trusted: an event is
 * either signed by the server (signing.ts — then its state is used as is) or only a hint
 * ("state moved to version N") that makes the client fetch the real state. A forged
 * event costs at most one extra fetch.
 */

/** Largest signed state accepted from the channel (the broadcast limit is higher). */
export const MAX_SIGNED_BYTES = 100_000;

export type LiveEvent = {
  type: "state";
  version: number;
  /** The shared state as JSON, and the server's signature over exactly that text. */
  signed?: { data: string; sig: string };
};

/** Who's online on a channel (the lobby avatars, "30 online"). */
export type PresenceMember = { key: string; nickname: string; role: "host" | "player" };

export type ChannelStatus = "connecting" | "connected" | "disconnected";

export interface SessionChannel {
  onEvent(handler: (event: LiveEvent) => void): () => void;
  onStatus(handler: (status: ChannelStatus) => void): () => void;
  onPresence(handler: (members: PresenceMember[]) => void): () => void;
  /** Announce this client (once connected; re-announced after a reconnect). */
  track(member: PresenceMember): void;
  close(): void;
}

/** Opens the channel of one session: `session:{sessionId}`. */
export type ChannelFactory = (sessionId: string, presenceKey?: string) => SessionChannel;

export const channelTopic = (sessionId: string) => `session:${sessionId}`;

/** Only well-formed events get through (anyone on the channel can send something). */
export function parseLiveEvent(event: string, payload: unknown): LiveEvent | null {
  if (event !== "state" || !payload || typeof payload !== "object") return null;
  const { version, data, sig } = payload as { version?: unknown; data?: unknown; sig?: unknown };
  if (typeof version !== "number" || !Number.isSafeInteger(version) || version < 0) return null;
  const signed =
    typeof data === "string" &&
    typeof sig === "string" &&
    data.length <= MAX_SIGNED_BYTES &&
    sig.length <= 200
      ? { data, sig }
      : undefined;
  return { type: "state", version, ...(signed && { signed }) };
}

/** Presence entries are client-made too: keep the well-formed ones. */
export function parsePresence(raw: unknown): PresenceMember | null {
  if (!raw || typeof raw !== "object") return null;
  const { key, nickname, role } = raw as Record<string, unknown>;
  if (typeof key !== "string" || key.length > 64) return null;
  if (typeof nickname !== "string" || nickname.length > 60) return null;
  if (role !== "host" && role !== "player") return null;
  return { key, nickname, role };
}
