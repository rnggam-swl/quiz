/**
 * The realtime layer (docs/02-architecture.md#realtime, P5-01). Screens only see this
 * interface; today it's Supabase Realtime, and a dedicated game server could replace it
 * without touching the players.
 *
 * Events are hints, never state: a client that hears "state moved to version N" fetches
 * the real state from the server. So a forged event costs at most one extra fetch.
 */

export type LiveEvent = { type: "state"; version: number };

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

/** Only well-formed hints get through (anyone on the channel can send something). */
export function parseLiveEvent(event: string, payload: unknown): LiveEvent | null {
  if (event !== "state" || !payload || typeof payload !== "object") return null;
  const version = (payload as { version?: unknown }).version;
  return typeof version === "number" && Number.isSafeInteger(version) && version >= 0
    ? { type: "state", version }
    : null;
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
