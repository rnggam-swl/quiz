"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";

import {
  channelTopic,
  parseLiveEvent,
  parsePresence,
  type ChannelFactory,
  type ChannelStatus,
  type LiveEvent,
  type PresenceMember,
} from "./types";

/**
 * SessionChannel on Supabase Realtime: a public Broadcast + Presence channel per session.
 * Participants have no Supabase account, so the channel can't be private; that's fine
 * because events are only hints (see types.ts) and presence is checked against the
 * participant list from the server.
 */
export const openSupabaseChannel: ChannelFactory = (sessionId, presenceKey) => {
  const supabase = createClient();
  const events = new Set<(event: LiveEvent) => void>();
  const statuses = new Set<(status: ChannelStatus) => void>();
  const presences = new Set<(members: PresenceMember[]) => void>();
  let status: ChannelStatus = "connecting";
  let member: PresenceMember | null = null;

  const channel: RealtimeChannel = supabase.channel(channelTopic(sessionId), {
    config: {
      broadcast: { self: false },
      presence: { key: presenceKey ?? "" },
    },
  });

  const setStatus = (next: ChannelStatus) => {
    status = next;
    for (const l of statuses) l(next);
  };

  channel.on("broadcast", { event: "state" }, ({ event, payload }) => {
    const parsed = parseLiveEvent(event, payload);
    if (parsed) for (const l of events) l(parsed);
  });
  channel.on("presence", { event: "sync" }, () => {
    const members = Object.values(channel.presenceState())
      .flat()
      .map(parsePresence)
      .filter((m): m is PresenceMember => !!m);
    for (const l of presences) l(members);
  });

  channel.subscribe((state) => {
    if (state === "SUBSCRIBED") {
      setStatus("connected");
      if (member) void channel.track(member);
    } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
      setStatus("disconnected");
    }
  });

  return {
    onEvent(handler) {
      events.add(handler);
      return () => events.delete(handler);
    },
    onStatus(handler) {
      statuses.add(handler);
      handler(status);
      return () => statuses.delete(handler);
    },
    onPresence(handler) {
      presences.add(handler);
      return () => presences.delete(handler);
    },
    track(next) {
      member = next;
      if (status === "connected") void channel.track(next);
    },
    close() {
      void supabase.removeChannel(channel);
    },
  };
};
