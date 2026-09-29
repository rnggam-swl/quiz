import { describe, expect, it } from "vitest";

import { snapshotFromDraft, type Snapshot } from "@/engine/practice/snapshot";
import { createMemoryHub } from "@/engine/transport/memory";
import { generateSigningKeys } from "@/engine/transport/signing";
import { createQuestion } from "@/questions/question";

import { avatarFor } from "./avatar";
import { DEFAULT_LIVE_FORM, livePolicyFrom, liveQuestionOrder, liveQuestions } from "./form";
import { createLocalLive } from "./local";
import { nextStepLabel, timedPhase } from "./phases";
import { leaderboardReplay, liveStandings } from "./report";
import { nextStreak, speedPoints, streakBonus } from "./scoring";
import type { RawLiveState } from "./types";
import { openSignedState, PERSONAL_PHASES, signState, withYou } from "./signed";
import { choiceCounts, hostView, playerView, sharedView } from "./view";

function quiz(): Snapshot {
  const mc = {
    ...createQuestion("multiple_choice"),
    id: "11111111-1111-4111-8111-111111111111",
    prompt: "Ibu kota?",
    config: {
      options: [
        { id: "a", text: "Jakarta" },
        { id: "b", text: "Bandung" },
      ],
      correctIds: ["a"],
      multiple: false,
    },
    explanation: "Sebelum IKN.",
  };
  const tf = {
    ...createQuestion("true_false"),
    id: "22222222-2222-4222-8222-222222222222",
    prompt: "Air mendidih di 100 °C.",
    config: { correct: true },
  };
  const essay = {
    ...createQuestion("essay"),
    id: "33333333-3333-4333-8333-333333333333",
    prompt: "Jelaskan.",
  };
  return snapshotFromDraft({ id: "q", title: "Kuis", description: "", coverUrl: null, theme: {} }, [
    mc,
    tf,
    essay,
  ]);
}

const policy = livePolicyFrom(DEFAULT_LIVE_FORM);

function raw(overrides: Partial<RawLiveState> = {}): RawLiveState {
  return {
    sessionId: "s",
    mode: "live",
    roundId: "r0",
    winner: null,
    versionId: "v",
    seed: 7,
    policy,
    code: "123456",
    version: 3,
    phase: "open",
    round: 0,
    questionCount: 2,
    questionId: "11111111-1111-4111-8111-111111111111",
    phaseOpenedAt: null,
    phaseClosesAt: null,
    roundOpenedAt: null,
    roundClosesAt: null,
    timeLimitMs: 20_000,
    paused: false,
    pausedRemainingMs: null,
    lobbyLocked: false,
    autoAdvance: false,
    players: 2,
    answered: 1,
    top: [],
    you: {
      id: "p1",
      nickname: "Ani",
      score: 1900,
      streak: 2,
      kicked: false,
      spectator: false,
      rank: 1,
      answer: { answer: { selectedIds: ["a"] }, correct: 1, total: 1, points: 1100, timeMs: 800 },
    },
    ...overrides,
  };
}

describe("scoring", () => {
  it("gives 100 % for an instant correct answer and 50 % at the last moment", () => {
    expect(speedPoints(1000, 1, 0, 20_000)).toBe(1000);
    expect(speedPoints(1000, 1, 10_000, 20_000)).toBe(750);
    expect(speedPoints(1000, 1, 20_000, 20_000)).toBe(500);
    expect(speedPoints(1000, 1, 99_000, 20_000)).toBe(500);
    expect(speedPoints(1000, 0.5, 0, 20_000)).toBe(500);
    expect(speedPoints(1000, 0, 0, 20_000)).toBe(0);
    expect(speedPoints(1000, 1, -5, 20_000)).toBe(1000);
  });

  it("adds +100 per answer in a row from the second, capped at +500", () => {
    expect([1, 2, 3, 6, 7, 20].map(streakBonus)).toEqual([0, 100, 200, 500, 500, 500]);
    expect(nextStreak(3, 1, 1)).toBe(4);
    expect(nextStreak(3, 0.5, 2)).toBe(0);
    expect(nextStreak(3, 0, 0)).toBe(3); // unscored
  });
});

describe("phases", () => {
  it("names the host's next step", () => {
    expect(nextStepLabel("lobby", null, 3)).toBe("Mulai");
    expect(nextStepLabel("leaderboard", 0, 3)).toBe("Soal berikutnya");
    expect(nextStepLabel("leaderboard", 2, 3)).toBe("Podium");
    expect(timedPhase("open", false)).toBe(true);
    expect(timedPhase("reveal", false)).toBe(false);
    expect(timedPhase("reveal", true)).toBe(true);
  });
});

describe("form", () => {
  it("skips types a live session can't play and keeps one order for everyone", () => {
    const snapshot = quiz();
    const { playable, skipped } = liveQuestions(snapshot);
    expect(playable.map((q) => q.type)).toEqual(["multiple_choice", "true_false"]);
    expect(skipped).toEqual([{ number: 3, typeLabel: "Esai" }]);
    const shuffled = livePolicyFrom({ ...DEFAULT_LIVE_FORM, shuffleQuestions: true });
    expect(liveQuestionOrder(snapshot, shuffled, 5)).toEqual(
      liveQuestionOrder(snapshot, shuffled, 5),
    );
    expect(liveQuestionOrder(snapshot, policy, 5)).toEqual(playable.map((q) => q.id));
  });
});

describe("views", () => {
  it("keeps the answer key and the new score from a phone until the reveal", () => {
    const view = playerView(raw(), quiz())!;
    expect(JSON.stringify(view)).not.toContain("correctIds");
    expect(view.reveal).toBeNull();
    expect(view.you).toMatchObject({
      answered: true,
      score: 800,
      rank: null,
      streak: null,
      result: null,
    });
    expect(view.question?.prompt).toBe("Ibu kota?");
  });

  it("shows the result and the answer from the reveal on", () => {
    const view = playerView(raw({ phase: "reveal" }), quiz())!;
    expect(view.reveal?.config).toMatchObject({ correctIds: ["a"] });
    expect(view.reveal?.explanation).toBe("Sebelum IKN.");
    expect(view.you).toMatchObject({ score: 1900, rank: 1, streak: 2 });
    expect(view.you.result).toEqual({ ratio: 1, points: 1100 });
    // No counts for phones.
    expect(view.reveal?.counts).toBeUndefined();
  });

  it("gives the host counts per choice at the reveal", () => {
    const answers = [
      { answer: { selectedIds: ["a"] }, correct: 1, total: 1 },
      { answer: { selectedIds: ["a"] }, correct: 1, total: 1 },
      { answer: { selectedIds: ["b"] }, correct: 0, total: 1 },
    ];
    const view = hostView(raw({ phase: "reveal", you: null }), quiz(), { answers });
    expect(view.reveal).toMatchObject({ correct: 2, wrong: 1, counts: { a: 2, b: 1 } });
    expect(choiceCounts("true_false", [{ answer: { value: true }, correct: 1, total: 1 }])).toEqual(
      {
        true: 1,
      },
    );
    expect(choiceCounts("short_answer", [])).toBeUndefined();
  });
});

describe("report", () => {
  const players = [
    { id: "a", nickname: "Ani" },
    { id: "b", nickname: "Budi" },
  ];
  const responses = [
    { participantId: "a", questionId: "q1", correct: 1, total: 1, points: 900, timeMs: 2000 },
    { participantId: "b", questionId: "q1", correct: 1, total: 1, points: 1000, timeMs: 1000 },
    { participantId: "a", questionId: "q2", correct: 1, total: 1, points: 1000, timeMs: 1000 },
    { participantId: "b", questionId: "q2", correct: 0, total: 1, points: 0, timeMs: 3000 },
  ];

  it("ranks by score with accuracy and speed", () => {
    expect(liveStandings(players, responses, ["q1", "q2"])).toEqual([
      {
        id: "a",
        nickname: "Ani",
        rank: 1,
        score: 1900,
        correct: 2,
        answered: 2,
        accuracy: 100,
        avgTimeMs: 1500,
      },
      {
        id: "b",
        nickname: "Budi",
        rank: 2,
        score: 1000,
        correct: 1,
        answered: 2,
        accuracy: 50,
        avgTimeMs: 2000,
      },
    ]);
  });

  it("replays the leaderboard after each question", () => {
    const frames = leaderboardReplay(players, responses, ["q1", "q2"]);
    expect(frames[0]!.top.map((t) => [t.nickname, t.score, t.rank])).toEqual([
      ["Budi", 1000, 1],
      ["Ani", 900, 2],
    ]);
    expect(frames[1]!.top.map((t) => [t.nickname, t.score, t.delta, t.rank, t.prevRank])).toEqual([
      ["Ani", 1900, 1000, 1, 2],
      ["Budi", 1000, 0, 2, 1],
    ]);
  });
});

describe("avatar", () => {
  it("is stable per id", () => {
    expect(avatarFor("abc")).toEqual(avatarFor("abc"));
    expect(avatarFor("abc").slot).toBeGreaterThanOrEqual(1);
  });
});

describe("local engine", () => {
  it("plays a round: speed points, one answer each, results after the reveal", async () => {
    const hub = createMemoryHub();
    const live = createLocalLive(quiz(), policy, { hub, latencyMs: 0 });
    const ani = await live.player.join("Ani");
    const budi = await live.player.join("Budi");
    if (!ani.ok || !budi.ok) throw new Error("join failed");
    expect((await live.player.join("ani")).ok && "ok").toBe("ok");

    let host = await live.host.state();
    if (!host.ok) throw new Error();
    expect(host.view.roster.map((r) => r.nickname)).toEqual(["Ani", "Budi", "ani 2"]);
    host = await live.host.advance(host.view.version, "next"); // countdown
    if (!host.ok) throw new Error();
    // A stale version does nothing.
    const stale = await live.host.advance(host.view.version - 1, "next");
    expect(stale.ok && stale.view.phase).toBe("countdown");
    host = await live.host.advance(host.view.version, "next"); // open
    if (!host.ok) throw new Error();
    const q = host.view.question!;
    expect(await live.player.answer(ani.token, q.id, { selectedIds: ["a"] })).toEqual({ ok: true });
    expect(await live.player.answer(ani.token, q.id, { selectedIds: ["b"] })).toEqual({
      ok: false,
      error: "already_answered",
    });
    await live.player.answer(budi.token, q.id, { selectedIds: ["b"] });

    const during = await live.player.state(ani.token);
    expect(during.ok && during.view.you.score).toBe(0);

    host = await live.host.advance(host.view.version, "next"); // reveal
    if (!host.ok) throw new Error();
    expect(host.view.reveal).toMatchObject({ correct: 1, wrong: 1, counts: { a: 1, b: 1 } });
    const after = await live.player.state(ani.token);
    if (!after.ok) throw new Error();
    expect(after.view.you.score).toBeGreaterThan(990);
    expect(after.view.you.rank).toBe(1);
    expect(await live.player.answer(budi.token, q.id, { selectedIds: ["a"] })).toMatchObject({
      error: "round_closed",
    });
  });
});

describe("signed shared state", () => {
  it("opens only a genuine event for this session and version", async () => {
    const { privateKey, publicKey } = await generateSigningKeys();
    const view = sharedView(raw({ phase: "countdown", version: 5 }), quiz());
    const signed = await signState(privateKey, { view, kicked: ["p9"] });
    const event = { type: "state" as const, version: 5, signed };
    expect(await openSignedState(event, publicKey, "s")).toMatchObject({ kicked: ["p9"] });
    expect(await openSignedState(event, publicKey, "other-session")).toBeNull();
    expect(await openSignedState({ ...event, version: 6 }, publicKey, "s")).toBeNull();
    const forged = { ...signed, data: signed.data.replace('"countdown"', '"podium"') };
    expect(await openSignedState({ ...event, signed: forged }, publicKey, "s")).toBeNull();
    expect(await openSignedState({ type: "state", version: 5 }, publicKey, "s")).toBeNull();
    // Nothing a phone may not know yet: the shared view has no answer key before the reveal.
    expect(signed.data).not.toContain("correctIds");
  });

  it("builds a phone's view: new round, instant right/wrong at the reveal, kicked", () => {
    const snapshot = quiz();
    const prev = playerView(raw(), snapshot)!;

    const next = withYou(prev, sharedView(raw({ phase: "reveal", version: 4 }), snapshot));
    expect(next.partial).toBe(true);
    expect(next.you.result).toEqual({ ratio: 1, points: null });
    expect(next.you.score).toBe(prev.you.score);

    const newRound = withYou(
      prev,
      sharedView(
        raw({ phase: "countdown", round: 1, questionId: "22222222-2222-4222-8222-222222222222" }),
        snapshot,
      ),
    );
    expect(newRound.you).toMatchObject({ answered: false, answer: null, result: null });

    expect(withYou(prev, sharedView(raw(), snapshot), ["p1"]).you.kicked).toBe(true);
    expect(PERSONAL_PHASES.has("reveal")).toBe(true);
    expect(PERSONAL_PHASES.has("open")).toBe(false);
  });
});

describe("rebutan", () => {
  it("plays only the types Rebutan supports, and says which ones need care", () => {
    const { playable, skipped, warned } = liveQuestions(quiz(), "battle_buzzer");
    expect(playable.map((q) => q.type)).toEqual(["multiple_choice", "true_false"]);
    expect(skipped.map((s) => s.typeLabel)).toEqual(["Esai"]);
    expect(warned).toEqual([]);
    const policy = livePolicyFrom({
      ...DEFAULT_LIVE_FORM,
      mode: "battle_buzzer",
      wrongPenalty: 250,
    });
    expect(policy.scoring).toBe("first_correct");
    expect(policy.buzzer).toEqual({ variant: "first_correct", holdS: 5, wrongPenalty: 250 });
  });

  it("shows a phone its verdict at once (one chance), unlike live", () => {
    const view = playerView(raw({ mode: "battle_buzzer" }), quiz())!;
    expect(view.you).toMatchObject({ score: 1900, result: { ratio: 1, points: 1100 } });
  });

  it("gives the round to the first right answer and takes the penalty for a wrong one", async () => {
    const hub = createMemoryHub();
    const live = createLocalLive(
      quiz(),
      livePolicyFrom({ ...DEFAULT_LIVE_FORM, mode: "battle_buzzer", wrongPenalty: 100 }),
      { hub, latencyMs: 0, mode: "battle_buzzer" },
    );
    const ani = await live.player.join("Ani");
    const budi = await live.player.join("Budi");
    const caca = await live.player.join("Caca");
    if (!ani.ok || !budi.ok || !caca.ok) throw new Error("join failed");
    let host = await live.host.state();
    if (!host.ok) throw new Error();
    host = await live.host.advance(host.view.version, "next");
    if (!host.ok) throw new Error();
    host = await live.host.advance(host.view.version, "next");
    if (!host.ok) throw new Error();
    const q = host.view.question!;

    expect(await live.player.answer(ani.token, q.id, { selectedIds: ["b"] })).toEqual({
      ok: true,
      outcome: { won: false, correct: false, points: 0 },
    });
    expect(await live.player.answer(budi.token, q.id, { selectedIds: ["a"] })).toEqual({
      ok: true,
      outcome: { won: true, correct: true, points: 1000 },
    });
    expect(await live.player.answer(caca.token, q.id, { selectedIds: ["a"] })).toMatchObject({
      ok: false,
      error: "round_closed",
    });
    const after = await live.host.state();
    if (!after.ok) throw new Error();
    expect(after.view.phase).toBe("reveal");
    expect(after.view.winner).toMatchObject({ nickname: "Budi" });
  });
});

describe("battle royale", () => {
  const royalePolicy = (patch: Partial<typeof DEFAULT_LIVE_FORM> = {}) =>
    livePolicyFrom({
      ...DEFAULT_LIVE_FORM,
      mode: "battle_royale",
      lateJoin: "spectator",
      ...patch,
    });

  it("names the host's next step by the survivors", () => {
    expect(nextStepLabel("reveal", 0, 5, { remaining: 1 })).toBe("Podium");
    expect(nextStepLabel("reveal", 0, 5, { remaining: 3 })).toBe("Papan skor");
    expect(nextStepLabel("leaderboard", 4, 5, { remaining: 3, suddenDeathEnabled: true })).toBe(
      "Sudden death",
    );
    expect(nextStepLabel("leaderboard", 4, 5, { remaining: 3, suddenDeathEnabled: false })).toBe(
      "Podium",
    );
  });

  it("takes lives, eliminates, keeps spectators playing for shadow points", async () => {
    const hub = createMemoryHub();
    const live = createLocalLive(quiz(), royalePolicy({ lives: 1 }), {
      hub,
      latencyMs: 0,
      mode: "battle_royale",
    });
    const ani = await live.player.join("Ani");
    const budi = await live.player.join("Budi");
    const caca = await live.player.join("Caca");
    if (!ani.ok || !budi.ok || !caca.ok) throw new Error("join failed");
    let host = await live.host.state();
    if (!host.ok) throw new Error();
    host = await live.host.advance(host.view.version, "next");
    if (!host.ok) throw new Error();
    host = await live.host.advance(host.view.version, "next");
    if (!host.ok) throw new Error();
    const q = host.view.question!;
    await live.player.answer(ani.token, q.id, { selectedIds: ["a"] });
    await live.player.answer(budi.token, q.id, { selectedIds: ["b"] });
    await live.player.answer(caca.token, q.id, { selectedIds: ["a"] });
    host = await live.host.advance(host.view.version, "next"); // reveal
    if (!host.ok) throw new Error();
    expect(host.view.royale).toMatchObject({ remaining: 2, total: 3 });
    expect(host.view.royale?.eliminated.map((e) => e.nickname)).toEqual(["Budi"]);

    const out = await live.player.state(budi.token);
    if (!out.ok) throw new Error();
    expect(out.view.you).toMatchObject({ spectator: true, lives: 0, eliminatedRound: 0 });

    // A late joiner only watches (P7-14).
    const telat = await live.player.join("Telat");
    if (!telat.ok) throw new Error();
    const watcher = await live.player.state(telat.token);
    expect(watcher.ok && watcher.view.you.spectator).toBe(true);

    host = await live.host.advance(host.view.version, "next"); // leaderboard
    if (!host.ok) throw new Error();
    host = await live.host.advance(host.view.version, "next"); // countdown
    if (!host.ok) throw new Error();
    host = await live.host.advance(host.view.version, "next"); // open
    if (!host.ok) throw new Error();
    const q2 = host.view.question!;
    // Budi plays on as a spectator: shadow points, not his score (P7-07).
    expect(await live.player.answer(budi.token, q2.id, { value: true })).toEqual({ ok: true });
    host = await live.host.advance(host.view.version, "next"); // reveal: Ani and Caca silent
    if (!host.ok) throw new Error();
    // Everyone left would go out at once: nobody does.
    expect(host.view.royale).toMatchObject({ remaining: 2, eliminated: [] });
    const shadow = await live.player.state(budi.token);
    if (!shadow.ok) throw new Error();
    expect(shadow.view.you.shadowScore).toBeGreaterThan(0);
    expect(shadow.view.you.score).toBe(0);
  });
});
