import "server-only";

import { getServerEnv } from "@/lib/env.server";

import { channelTopic, type LiveEvent } from "./types";

/**
 * Tell everyone on a session's channel that its state moved (P5-02). Called by Server
 * Actions after their transaction committed, over Realtime's REST endpoint so the
 * server never holds a socket. Best effort: clients also refetch on reconnect, when
 * the tab comes back, and on a slow poll, so a lost broadcast only delays them.
 */
export async function broadcast(sessionId: string, event: LiveEvent): Promise<boolean> {
  const env = getServerEnv();
  try {
    const response = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [
          {
            topic: channelTopic(sessionId),
            event: event.type,
            payload: { version: event.version },
            private: false,
          },
        ],
      }),
      signal: AbortSignal.timeout(3000),
    });
    await response.body?.cancel();
    if (!response.ok) console.error("live broadcast failed", response.status);
    return response.ok;
  } catch (error) {
    console.error("live broadcast failed", error);
    return false;
  }
}
