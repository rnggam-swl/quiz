// Live load test (P5-19, docs/09-mode-live.md#uji-beban).
//
// Simulates N participants in an existing live session that is still in its lobby:
// they join, listen on the Realtime channel and answer every question, through the same
// RPCs the Server Actions use. The host moves the phases (advance_live as a real host
// account) and broadcasts like the app: the state signed with the key the server
// derives from PARTICIPANT_TOKEN_SECRET. Phones verify it and fetch only their own
// numbers, at the reveal and the end, spread over a second — the app's protocol.
//
// Measures, per phase change: host action → signed state verified on each phone (what
// the participant sees; the DoD asks p95 < 1 s), host action → own points after the
// reveal, and the answer RPC latency.
//
//   pnpm load:live --session <live-session-id> [--players 200] [--rounds 5]
//
// Env (.env.local is read automatically): NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, PARTICIPANT_TOKEN_SECRET,
// LOAD_HOST_EMAIL, LOAD_HOST_PASSWORD (the host who owns the session). Never run it
// against a session real students are in: it adds 200 fake participants.

import { createECDH, hkdfSync } from "node:crypto";
import { parseArgs } from "node:util";

import { createClient } from "@supabase/supabase-js";

try {
  process.loadEnvFile(".env.local");
} catch {
  // Variables may come from the shell.
}

const { values } = parseArgs({
  options: {
    session: { type: "string" },
    players: { type: "string", default: "200" },
    rounds: { type: "string", default: "5" },
  },
});
const sessionId = values.session;
const players = Number(values.players);
const maxRounds = Number(values.rounds);
if (!sessionId) {
  console.error("Usage: pnpm load:live --session <live-session-id> [--players 200] [--rounds 5]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = process.env.SUPABASE_SECRET_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);
const host = createClient(url, publishable, options);

const { error: signInError } = await host.auth.signInWithPassword({
  email: process.env.LOAD_HOST_EMAIL,
  password: process.env.LOAD_HOST_PASSWORD,
});
if (signInError) throw new Error(`Host sign-in failed: ${signInError.message}`);

const topic = `session:${sessionId}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stats(label, samples) {
  if (samples.length === 0) return console.log(`${label}: no samples`);
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  console.log(
    `${label}: n=${sorted.length} p50=${at(50)}ms p95=${at(95)}ms p99=${at(99)}ms max=${sorted.at(-1)}ms`,
  );
}

// ─── Signing (same derivation as src/engine/transport/keys.ts) ─────────────────

const b64url = (bytes) => Buffer.from(bytes).toString("base64url");
const ALG = { name: "ECDSA", namedCurve: "P-256" };
const SIGN = { name: "ECDSA", hash: "SHA-256" };

function deriveJwk(tokenSecret) {
  for (let i = 0; i < 16; i++) {
    const d = Buffer.from(hkdfSync("sha256", tokenSecret, "", `live-state-signing-v1:${i}`, 32));
    const ecdh = createECDH("prime256v1");
    try {
      ecdh.setPrivateKey(d);
    } catch {
      continue;
    }
    const point = ecdh.getPublicKey();
    return {
      kty: "EC",
      crv: "P-256",
      x: b64url(point.subarray(1, 33)),
      y: b64url(point.subarray(33, 65)),
      d: b64url(d),
    };
  }
  throw new Error("no key");
}

const jwk = deriveJwk(process.env.PARTICIPANT_TOKEN_SECRET);
const signKey = await crypto.subtle.importKey("jwk", jwk, ALG, false, ["sign"]);
const verifyKey = await crypto.subtle.importKey(
  "jwk",
  { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y },
  ALG,
  false,
  ["verify"],
);
const encoder = new TextEncoder();

let lastBroadcastAt = 0;

async function broadcast(state) {
  // The app signs its shared view; the raw state is about the same size.
  const data = JSON.stringify({ view: state });
  const sig = b64url(new Uint8Array(await crypto.subtle.sign(SIGN, signKey, encoder.encode(data))));
  lastBroadcastAt = Date.now();
  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [
        { topic, event: "state", payload: { version: state.version, data, sig }, private: false },
      ],
    }),
  });
  if (!response.ok) throw new Error(`broadcast failed: ${response.status}`);
}

// ─── Participants ──────────────────────────────────────────────────────────────

console.log(`Joining ${players} participants…`);
const people = [];
for (let i = 0; i < players; i += 20) {
  const batch = await Promise.all(
    Array.from({ length: Math.min(20, players - i) }, (_, k) =>
      admin.rpc("join_live", { p_session_id: sessionId, p_nickname: `Bot ${i + k + 1}` }),
    ),
  );
  for (const { data, error } of batch) {
    if (error) throw new Error(`join failed: ${error.message}`);
    people.push({ id: data.id, received: new Map(), shown: new Map(), personal: new Map() });
  }
}

const PERSONAL = new Set(["reveal", "podium", "ended"]);
let badSignatures = 0;
let unsigned = 0;

console.log("Connecting to Realtime…");
const sockets = [];
await Promise.all(
  people.map(
    (person) =>
      new Promise((resolve, reject) => {
        const client = createClient(url, publishable, options);
        const channel = client.channel(topic, { config: { broadcast: { self: false } } });
        channel.on("broadcast", { event: "state" }, async ({ payload }) => {
          const { version, data, sig } = payload ?? {};
          // Not from this script (e.g. a host screen still open elsewhere): not measured.
          if (typeof data !== "string" || typeof sig !== "string") return void unsigned++;
          if (person.received.has(version)) return;
          person.received.set(version, Date.now());
          // Like the app: verify, then show the carried state without fetching.
          const ok = await crypto.subtle
            .verify(SIGN, verifyKey, Buffer.from(sig, "base64url"), encoder.encode(data))
            .catch(() => false);
          if (!ok) return void badSignatures++;
          person.shown.set(version, Date.now());
          // Own points after the reveal and at the end, spread over a second.
          const { view } = JSON.parse(data);
          if (PERSONAL.has(view.phase)) {
            await sleep(Math.random() * 1000);
            await admin.rpc("live_state", {
              p_session_id: sessionId,
              p_participant_id: person.id,
            });
            person.personal.set(version, Date.now());
          }
        });
        channel.subscribe((status) => {
          if (status === "SUBSCRIBED") resolve();
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(new Error(status));
        });
        sockets.push(client);
      }),
  ),
);

// ─── Game ──────────────────────────────────────────────────────────────────────

const eventMs = [];
const fanOutMs = [];
const shownMs = [];
const personalMs = [];
const answerMs = [];

async function state() {
  const { data, error } = await host.rpc("live_state", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return data;
}

/** What the host's Server Action does: advance, read the state, sign and broadcast. */
async function advance(action = "next") {
  const before = await state();
  const actionAt = Date.now();
  const { data: moved, error } = await host.rpc("advance_live", {
    p_session_id: sessionId,
    p_version: before.version,
    p_action: action,
  });
  if (error) throw new Error(`advance failed: ${error.message}`);
  if (moved.state_version === before.version) {
    throw new Error(
      "The session didn't move: something else is advancing it. Close every host screen " +
        "of this session (also on Vercel) and start again with a new session.",
    );
  }
  const after = await state();
  await broadcast(after);
  // Give the phones time to hear it (and fetch their own numbers), then collect.
  await sleep(2500);
  let missed = 0;
  for (const person of people) {
    const heard = person.received.get(after.version);
    const shown = person.shown.get(after.version);
    const personal = person.personal.get(after.version);
    if (heard === undefined) {
      missed++;
    } else {
      eventMs.push(heard - actionAt);
      fanOutMs.push(heard - lastBroadcastAt);
    }
    if (shown !== undefined) shownMs.push(shown - actionAt);
    if (personal !== undefined) personalMs.push(personal - actionAt);
  }
  if (missed) console.warn(`  ${missed} participants missed version ${after.version}`);
  return after;
}

const first = await state();
if (first.phase !== "lobby") throw new Error(`Session is in "${first.phase}", expected the lobby.`);
const rounds = Math.min(maxRounds, first.questionCount);

for (let r = 0; r < rounds; r++) {
  console.log(`Round ${r + 1}/${rounds}`);
  await advance(); // countdown
  await sleep(3000);
  const open = await advance(); // open
  await Promise.all(
    people.map(async (person) => {
      await sleep(Math.random() * 3000);
      const correct = Math.random() < 0.7 ? 1 : 0;
      const start = Date.now();
      const { error } = await admin.rpc("record_live_answer", {
        p_participant_id: person.id,
        p_question_id: open.questionId,
        p_answer: { load: true },
        p_correct: correct,
        p_total: 1,
        p_base_points: 1000,
      });
      if (error && !error.message.includes("round_closed"))
        console.warn("  answer:", error.message);
      answerMs.push(Date.now() - start);
    }),
  );
  await advance(); // reveal
  await advance(); // leaderboard
}
await advance("end");

console.log("\nResults");
stats("Broadcast sent → event on phone (Realtime only)", fanOutMs);
stats("Host action → event on phone", eventMs);
stats("Host action → new state shown (signed, no fetch)", shownMs);
stats("Host action → own points after reveal/end (fetch)", personalMs);
stats("Answer (record_live_answer)", answerMs);
if (badSignatures) console.warn(`${badSignatures} events failed verification`);
if (unsigned) {
  console.warn(
    `${unsigned} unsigned events came from elsewhere (an open host screen?): not measured.`,
  );
}

for (const client of sockets) await client.removeAllChannels();
process.exit(0);
