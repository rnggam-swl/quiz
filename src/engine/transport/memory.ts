import type {
  ChannelFactory,
  ChannelStatus,
  LiveEvent,
  PresenceMember,
  SessionChannel,
} from "./types";

type Listener<T> = (value: T) => void;

/**
 * An in-memory realtime hub: channels in the same page talk to each other. Powers the
 * playground and unit tests; `setOnline(false)` simulates a dropped connection.
 */
export function createMemoryHub() {
  type Client = {
    sessionId: string;
    events: Set<Listener<LiveEvent>>;
    statuses: Set<Listener<ChannelStatus>>;
    presences: Set<Listener<PresenceMember[]>>;
    member: PresenceMember | null;
  };
  const clients = new Set<Client>();
  let online = true;

  const membersOf = (sessionId: string) =>
    [...clients].filter((c) => c.sessionId === sessionId && c.member).map((c) => c.member!);

  function emitPresence(sessionId: string) {
    const members = membersOf(sessionId);
    for (const c of clients) {
      if (c.sessionId === sessionId) for (const l of c.presences) l(members);
    }
  }

  const open: ChannelFactory = (sessionId) => {
    const client: Client = {
      sessionId,
      events: new Set(),
      statuses: new Set(),
      presences: new Set(),
      member: null,
    };
    clients.add(client);
    const channel: SessionChannel = {
      onEvent(handler) {
        client.events.add(handler);
        return () => client.events.delete(handler);
      },
      onStatus(handler) {
        client.statuses.add(handler);
        queueMicrotask(() => handler(online ? "connected" : "disconnected"));
        return () => client.statuses.delete(handler);
      },
      onPresence(handler) {
        client.presences.add(handler);
        queueMicrotask(() => handler(membersOf(sessionId)));
        return () => client.presences.delete(handler);
      },
      track(member) {
        client.member = member;
        emitPresence(sessionId);
      },
      close() {
        clients.delete(client);
        emitPresence(sessionId);
      },
    };
    return channel;
  };

  return {
    open,
    /** What the server does after a transaction: tell everyone the state moved. */
    broadcast(sessionId: string, event: LiveEvent) {
      if (!online) return;
      for (const c of clients) {
        if (c.sessionId === sessionId) for (const l of c.events) l(event);
      }
    },
    setOnline(value: boolean) {
      online = value;
      for (const c of clients) for (const l of c.statuses) l(value ? "connected" : "disconnected");
    },
  };
}

export type MemoryHub = ReturnType<typeof createMemoryHub>;
