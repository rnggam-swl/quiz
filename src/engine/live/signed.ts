import { signText, verifyText, type LivePublicKey } from "@/engine/transport/signing";
import type { LiveEvent } from "@/engine/transport/types";
import { getDefinition } from "@/questions/registry";

import type { LiveView, PlayerView } from "./types";

/**
 * The state every phone shares, broadcast with the server's signature so phones can use
 * it straight away instead of all fetching it at once. Only what differs per phone —
 * points, score, rank — is fetched, and only when it changed (the reveal and the end).
 */
export type SharedState = {
  view: LiveView;
  /** Participants the host just removed (they learn it from the broadcast). */
  kicked?: string[];
};

export async function signState(
  privateKey: CryptoKey,
  state: SharedState,
): Promise<{ data: string; sig: string }> {
  const data = JSON.stringify(state);
  return { data, sig: await signText(privateKey, data) };
}

/** The verified shared state in an event, or null (unsigned, forged, another session). */
export async function openSignedState(
  event: LiveEvent,
  publicKey: LivePublicKey,
  sessionId: string,
): Promise<SharedState | null> {
  if (!event.signed) return null;
  if (!(await verifyText(publicKey, event.signed.data, event.signed.sig))) return null;
  let state: SharedState;
  try {
    state = JSON.parse(event.signed.data) as SharedState;
  } catch {
    return null;
  }
  const view = state?.view;
  if (!view || view.sessionId !== sessionId || view.version !== event.version) return null;
  return state;
}

/** Right or wrong from the revealed key, before the server's points arrive. */
function localRatio(view: LiveView, answer: unknown): number | null {
  const q = view.question;
  if (!q || !view.reveal) return null;
  const definition = getDefinition(q.type);
  const parsedConfig = definition.configSchema.safeParse(view.reveal.config);
  const parsedAnswer = definition.answerSchema.safeParse(answer);
  if (!parsedConfig.success || !parsedAnswer.success) return null;
  return definition.score(parsedConfig.data as never, parsedAnswer.data as never).ratio;
}

/** Phases whose personal numbers (points, score, rank) a phone has to fetch. */
export const PERSONAL_PHASES = new Set(["reveal", "podium", "ended"]);

/**
 * A phone's view from a verified broadcast and what it already knew about itself.
 * `partial` marks it: personal numbers are the old ones until the phone fetches them.
 */
export function withYou(
  prev: PlayerView,
  next: LiveView,
  kicked: readonly string[] = [],
): PlayerView {
  const you = { ...prev.you };
  if (next.round !== prev.round) {
    you.answered = false;
    you.answer = null;
    you.result = null;
  }
  if (kicked.includes(you.id)) you.kicked = true;
  // Mode tim: the lobby lists who is in which team (after a shuffle, a choice).
  const team = next.teams?.find((t) => t.memberIds?.includes(you.id));
  if (team) you.team = { id: team.id, slot: team.slot, name: team.name };
  if (next.phase === "reveal" && you.answered && !you.result) {
    const ratio = localRatio(next, you.answer);
    if (ratio !== null) you.result = { ratio, points: null };
  }
  return { ...next, you, partial: true };
}
