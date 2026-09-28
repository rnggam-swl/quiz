// Live load test (P5-19, docs/09-mode-live.md#uji-beban).
//
// Simulates N participants in an existing live session that is still in its lobby:
// they join, listen on the Realtime channel, answer every question and fetch their
// state after each phase change — the same RPCs the Server Actions use. The host
// moves the phases (advance_live as a real host account) and broadcasts like the app.
//
// Measures, per phase change: host action → event received on each phone, and host
// action → the phone has fetched the new state (what the participant sees; the DoD
// asks p95 < 1 s), plus the answer RPC latency.
//
//   pnpm load:live --session <live-session-id> [--players 200] [--rounds 5]
//
// Env (.env.local is read automatically): NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY, LOAD_HOST_EMAIL,
// LOAD_HOST_PASSWORD (the host who owns the session). Never run it against a session
// real students are in: it adds 200 fake participants.

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

async function broadcast(version) {
  const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messages: [{ topic, event: "state", payload: { version }, private: false }],
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
    people.push({ id: data.id, received: new Map(), fetched: new Map() });
  }
}

console.log("Connecting to Realtime…");
const sockets = [];
await Promise.all(
  people.map(
    (person) =>
      new Promise((resolve, reject) => {
        const client = createClient(url, publishable, options);
        const channel = client.channel(topic, { config: { broadcast: { self: false } } });
        channel.on("broadcast", { event: "state" }, async ({ payload }) => {
          if (person.received.has(payload.version)) return;
          person.received.set(payload.version, Date.now());
          // Like the app: an event means "refetch your state".
          await admin.rpc("live_state", { p_session_id: sessionId, p_participant_id: person.id });
          person.fetched.set(payload.version, Date.now());
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
const screenMs = [];
const answerMs = [];

async function state() {
  const { data, error } = await host.rpc("live_state", { p_session_id: sessionId });
  if (error) throw new Error(error.message);
  return data;
}

/** What the host's Server Action does: advance, then broadcast. Timed from the click. */
async function advance(action = "next") {
  const before = await state();
  const actionAt = Date.now();
  const { data, error } = await host.rpc("advance_live", {
    p_session_id: sessionId,
    p_version: before.version,
    p_action: action,
  });
  if (error) throw new Error(`advance failed: ${error.message}`);
  await broadcast(data.state_version);
  // Give the phones time to hear it and refetch, then collect.
  await sleep(2500);
  let missed = 0;
  for (const person of people) {
    const heard = person.received.get(data.state_version);
    const fetched = person.fetched.get(data.state_version);
    if (heard === undefined) missed++;
    else eventMs.push(heard - actionAt);
    if (fetched !== undefined) screenMs.push(fetched - actionAt);
  }
  if (missed) console.warn(`  ${missed} participants missed version ${data.state_version}`);
  return data;
}

const first = await state();
if (first.phase !== "lobby") throw new Error(`Session is in "${first.phase}", expected the lobby.`);
const rounds = Math.min(maxRounds, first.questionCount);

for (let r = 0; r < rounds; r++) {
  console.log(`Round ${r + 1}/${rounds}`);
  await advance(); // countdown
  await sleep(3000);
  await advance(); // open
  const open = await state();
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
stats("Host action → event on phone", eventMs);
stats("Host action → new state on phone", screenMs);
stats("Answer (record_live_answer)", answerMs);

for (const client of sockets) await client.removeAllChannels();
process.exit(0);
