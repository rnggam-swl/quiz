import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

let db: PGlite;
let host: string;
let quizId: string;
let versionId: string;
let q1: string;
let q2: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

type Session = { id: string; phase: string; state_version: number; current_round: number | null };
type Outcome = {
  accepted: boolean;
  pending?: boolean;
  reactionMs?: number;
  resolveInMs?: number;
  won?: boolean;
  correct?: boolean;
  points?: number;
  reason?: string;
  winner?: { id: string; nickname: string } | null;
};

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "guru@sekolah.id" });
  q1 = crypto.randomUUID();
  q2 = crypto.randomUUID();
  ({ quizId, versionId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Rebutan') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          { id: q1, type: "true_false", prompt: "A?", config: { correct: true }, points: 1000 },
          { id: q2, type: "true_false", prompt: "B?", config: { correct: false }, points: 500 },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'rebutan-ab1')", [id]);
      const version = await one<{ id: string }>(
        tx,
        "select id from public.quiz_versions where quiz_id = $1",
        [id],
      );
      return { quizId: id, versionId: version.id };
    },
    { commit: true },
  ));
}, 60_000);

const asHost = <T>(fn: (tx: Transaction) => Promise<T>) => as(db, user(host), fn, { commit: true });
const asService = <T>(fn: (tx: Transaction) => Promise<T>) => as(db, service, fn, { commit: true });

/** A session in the lobby. Without a grace window unless asked: the first right answer wins. */
async function newSession(
  mode = "battle_buzzer",
  buzzer: Record<string, unknown> = { graceMs: 0 },
): Promise<string> {
  return asHost(
    async (tx) =>
      (
        await one<{ id: string }>(
          tx,
          `insert into public.sessions
           (quiz_id, quiz_version_id, mode, status, phase, code, policy, seed, question_ids)
         values ($1, $2, $3, 'lobby', 'lobby', public.generate_session_code(), $5, 1, $4)
         returning id`,
          [quizId, versionId, mode, [q1, q2], JSON.stringify({ buzzer })],
        )
      ).id,
  );
}

const join = (sessionId: string, nickname: string) =>
  asService((tx) =>
    one<{ id: string }>(tx, "select id from public.join_live($1, $2)", [sessionId, nickname]),
  );

const session = (sessionId: string) =>
  asHost((tx) => one<Session>(tx, "select * from public.sessions where id = $1", [sessionId]));

/** Lobby → countdown → open (or leaderboard → countdown → open). */
async function openRound(sessionId: string) {
  let s = await session(sessionId);
  s = await asHost((tx) =>
    one<Session>(tx, "select * from public.advance_live($1, $2, 'next')", [
      sessionId,
      s.state_version,
    ]),
  );
  return asHost((tx) =>
    one<Session>(tx, "select * from public.advance_live($1, $2, 'next')", [
      sessionId,
      s.state_version,
    ]),
  );
}

const buzz = (
  participantId: string,
  questionId: string,
  correct: boolean,
  penalty = 0,
  clientMs: number | null = null,
) =>
  asService((tx) =>
    one<{ outcome: Outcome }>(
      tx,
      "select public.record_battle_answer($1, $2, $3, $4, $5, $6, $7) as outcome",
      [
        participantId,
        questionId,
        JSON.stringify({ value: correct }),
        correct,
        1000,
        penalty,
        clientMs,
      ],
    ).then((r) => r.outcome),
  );

describe("record_battle_answer", () => {
  it("gives the round to the first correct answer and moves straight to the reveal", async () => {
    const sessionId = await newSession();
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    const caca = await join(sessionId, "Caca");
    const open = await openRound(sessionId);

    expect(await buzz(ani.id, q1, false)).toMatchObject({
      accepted: true,
      won: false,
      correct: false,
    });
    expect(await buzz(budi.id, q1, true)).toMatchObject({
      accepted: true,
      won: true,
      points: 1000,
    });
    expect(await buzz(caca.id, q1, true)).toMatchObject({
      accepted: false,
      reason: "round_closed",
      winner: { id: budi.id, nickname: "Budi" },
    });

    const after = await session(sessionId);
    expect(after.phase).toBe("reveal");
    expect(after.state_version).toBe(open.state_version + 1);
    const scores = await asHost((tx) =>
      tx.query<{ nickname: string; score: number }>(
        "select nickname, score from public.participants where session_id = $1 order by nickname",
        [sessionId],
      ),
    );
    expect(scores.rows).toEqual([
      { nickname: "Ani", score: 0 },
      { nickname: "Budi", score: 1000 },
      { nickname: "Caca", score: 0 },
    ]);
  });

  it("has exactly one winner out of 50 correct answers (P6-12)", async () => {
    const sessionId = await newSession();
    const players = [];
    for (let i = 0; i < 50; i++) players.push(await join(sessionId, `P${i}`));
    await openRound(sessionId);
    const outcomes = await Promise.all(players.map((p) => buzz(p.id, q1, true)));
    expect(outcomes.filter((o) => o.won)).toHaveLength(1);
    expect(outcomes.filter((o) => !o.accepted && o.reason === "round_closed")).toHaveLength(49);
    const winners = await asHost((tx) =>
      tx.query(
        `select w.* from public.round_winners w join public.battle_rounds r on r.id = w.round_id
          where r.session_id = $1`,
        [sessionId],
      ),
    );
    expect(winners.rows).toHaveLength(1);
  });

  it("allows one answer per question, none after the deadline, and none from outside (P6-13)", async () => {
    const sessionId = await newSession();
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);

    await buzz(ani.id, q1, false);
    expect(await buzz(ani.id, q1, true)).toMatchObject({
      accepted: false,
      reason: "already_answered",
    });

    await db.query(
      "update public.battle_rounds set closes_at = now() - interval '2 seconds' where session_id = $1",
      [sessionId],
    );
    expect(await buzz(budi.id, q1, true)).toMatchObject({
      accepted: false,
      reason: "deadline_passed",
    });

    const call = (tx: Transaction) =>
      tx.query("select public.record_battle_answer($1, $2, '{}', true, 1000, 0)", [budi.id, q1]);
    await expect(as(db, anon, call)).rejects.toThrow(/permission denied/);
    await expect(as(db, user(host), call)).rejects.toThrow(/permission denied/);
  });

  it("takes the wrong-answer penalty, never below zero", async () => {
    const sessionId = await newSession();
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await db.query("update public.participants set score = 150 where id = $1", [budi.id]);
    await openRound(sessionId);
    expect(await buzz(ani.id, q1, false, 200)).toMatchObject({ points: 0 });
    expect(await buzz(budi.id, q1, false, 200)).toMatchObject({ points: -150 });
    const rows = await asHost((tx) =>
      tx.query<{ nickname: string; score: number }>(
        "select nickname, score from public.participants where session_id = $1 order by nickname",
        [sessionId],
      ),
    );
    expect(rows.rows.map((r) => r.score)).toEqual([0, 0]);
  });

  it("refuses kicked players, spectators and live sessions", async () => {
    const sessionId = await newSession();
    const usil = await join(sessionId, "Usil");
    await asHost((tx) => tx.query("select public.kick_participant($1, $2)", [sessionId, usil.id]));
    await openRound(sessionId);
    await expect(buzz(usil.id, q1, true)).rejects.toThrow(/kicked/);

    const live = await newSession("live");
    const p = await join(live, "Ani");
    await openRound(live);
    await expect(buzz(p.id, q1, true)).rejects.toThrow(/wrong_mode/);
  });
});

describe("live_state for battle", () => {
  it("reports the mode, the answers, the winner and wins on the leaderboard", async () => {
    const sessionId = await newSession();
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);
    await buzz(ani.id, q1, false);

    const during = await asHost((tx) =>
      one<{ state: Row }>(tx, "select public.live_state($1) as state", [sessionId]),
    ).then((r) => r.state);
    expect(during).toMatchObject({ mode: "battle_buzzer", answered: 1, winner: null });

    await buzz(budi.id, q1, true);
    let s = await session(sessionId);
    s = await asHost((tx) =>
      one<Session>(tx, "select * from public.advance_live($1, $2, 'next')", [
        sessionId,
        s.state_version,
      ]),
    );
    const board = await asHost((tx) =>
      one<{ state: Row & { top: Row[]; winner: Row } }>(
        tx,
        "select public.live_state($1) as state",
        [sessionId],
      ),
    ).then((r) => r.state);
    expect(board.phase).toBe("leaderboard");
    expect(board.winner).toMatchObject({ nickname: "Budi" });
    expect(board.top.map((t) => [t.nickname, t.score, t.delta, Number(t.wins)])).toEqual([
      ["Budi", 1000, 1000, 1],
      ["Ani", 0, 0, 0],
    ]);

    const you = await asService((tx) =>
      one<{ state: { you: Row } }>(tx, "select public.live_state($1, $2) as state", [
        sessionId,
        ani.id,
      ]),
    ).then((r) => r.state.you);
    expect(you.answer).toMatchObject({ correct: 0, total: 1, points: 0 });
  });
});

describe("jeda toleransi (P8-04)", () => {
  const resolve =
    (actor = service) =>
    (sessionId: string) =>
      as(
        db,
        actor,
        async (tx) =>
          (
            await one<{ r: { status: string; waitMs?: number; winnerId?: string } }>(
              tx,
              "select public.resolve_buzzer_round($1) as r",
              [sessionId],
            )
          ).r,
        { commit: true },
      );

  it("lets the fastest reaction in the window win, not the first to arrive", async () => {
    const sessionId = await newSession("battle_buzzer", { graceMs: 250 });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    const caca = await join(sessionId, "Caca");
    const dodi = await join(sessionId, "Dodi");
    await openRound(sessionId);
    // The question has been up for 2 s.
    await db.query(
      "update public.battle_rounds set opened_at = now() - interval '2 seconds' where session_id = $1",
      [sessionId],
    );

    // Ani arrives first (tapped at 1.95 s), Budi second but tapped at 1.8 s.
    const first = await buzz(ani.id, q1, true, 0, 1950);
    expect(first).toMatchObject({ accepted: true, pending: true, reactionMs: 1950 });
    expect(first.resolveInMs).toBeGreaterThan(0);
    expect(await buzz(budi.id, q1, true, 0, 1800)).toMatchObject({
      pending: true,
      reactionMs: 1800,
    });
    // A phone claiming 50 ms gets at most 300 ms of credit.
    const liar = await buzz(caca.id, q1, false, 0, 50);
    expect(liar.reactionMs).toBeGreaterThanOrEqual(1700);

    expect(await resolve()(sessionId)).toMatchObject({ status: "pending" });
    expect((await session(sessionId)).phase).toBe("open");

    // The window is over.
    await db.query(
      "update public.battle_rounds set resolve_at = now() - interval '1 millisecond' where session_id = $1",
      [sessionId],
    );
    expect(await buzz(dodi.id, q1, true)).toMatchObject({
      accepted: false,
      reason: "round_closed",
    });
    expect(await resolve()(sessionId)).toEqual({ status: "resolved", winnerId: budi.id });
    expect(await resolve()(sessionId)).toEqual({ status: "none" }); // only once
    expect((await session(sessionId)).phase).toBe("reveal");

    const rows = await asHost((tx) =>
      tx.query<{ nickname: string; score: number; streak: number }>(
        "select nickname, score, streak from public.participants where session_id = $1 order by nickname",
        [sessionId],
      ),
    );
    expect(rows.rows.map((r) => [r.nickname, r.score, r.streak])).toEqual([
      ["Ani", 0, 0],
      ["Budi", 1000, 1],
      ["Caca", 0, 0],
      ["Dodi", 0, 0],
    ]);
  });

  it("is resolved only by the service role or the session's host", async () => {
    const sessionId = await newSession("battle_buzzer", { graceMs: 250 });
    const ani = await join(sessionId, "Ani");
    await openRound(sessionId);
    await buzz(ani.id, q1, true);
    await db.query(
      "update public.battle_rounds set resolve_at = now() - interval '1 millisecond' where session_id = $1",
      [sessionId],
    );
    const stranger = await createUser(db, { email: "asing@sekolah.id" });
    expect(await resolve(user(stranger))(sessionId)).toEqual({ status: "none" });
    expect(await resolve(user(host))(sessionId)).toEqual({ status: "resolved", winnerId: ani.id });
  });
});

describe("pencet lalu jawab (P8-01)", () => {
  type Buzz = {
    accepted: boolean;
    reason?: string;
    holder?: { nickname: string };
    expiresAt?: string;
  };
  const buzzIn = (participantId: string, questionId = q1) =>
    asService((tx) =>
      one<{ r: Buzz }>(tx, "select public.buzz_in($1, $2) as r", [participantId, questionId]).then(
        (r) => r.r,
      ),
    );
  const hold = (sessionId: string) =>
    asHost((tx) =>
      one<{ s: { hold: { nickname: string } | null } }>(
        tx,
        "select public.live_game_state($1) as s",
        [sessionId],
      ).then((r) => r.s.hold),
    );

  it("gives the round to one buzzer at a time; wrong or too slow opens it again", async () => {
    const sessionId = await newSession("battle_buzzer", {
      variant: "buzz_then_answer",
      holdS: 5,
      wrongPenalty: 100,
    });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    const caca = await join(sessionId, "Caca");
    await db.query("update public.participants set score = 300 where session_id = $1", [sessionId]);
    await openRound(sessionId);

    // No answering without holding the buzzer.
    expect(await buzz(ani.id, q1, true)).toMatchObject({ accepted: false, reason: "not_holding" });

    const before = await session(sessionId);
    expect(await buzzIn(ani.id)).toMatchObject({ accepted: true });
    expect((await session(sessionId)).state_version).toBe(before.state_version + 1);
    expect(await hold(sessionId)).toMatchObject({ nickname: "Ani" });
    expect(await buzzIn(budi.id)).toMatchObject({
      accepted: false,
      reason: "held",
      holder: { nickname: "Ani" },
    });
    expect(await buzz(budi.id, q1, true)).toMatchObject({ reason: "not_holding" });

    // Ani is wrong: penalty, out for this question, the buzzer is free.
    expect(await buzz(ani.id, q1, false, 100)).toMatchObject({
      accepted: true,
      won: false,
      points: -100,
    });
    expect(await hold(sessionId)).toBeNull();
    expect(await buzzIn(ani.id)).toMatchObject({ accepted: false, reason: "already_answered" });

    // Budi buzzes but lets the hold run out; Caca's buzz expires it.
    expect(await buzzIn(budi.id)).toMatchObject({ accepted: true });
    await db.query(
      `update public.buzzer_holds h set expires_at = now() - interval '2 seconds'
         from public.battle_rounds r where r.id = h.round_id and r.session_id = $1`,
      [sessionId],
    );
    expect(await buzzIn(caca.id)).toMatchObject({ accepted: true });
    expect(await buzzIn(budi.id)).toMatchObject({ accepted: false, reason: "already_answered" });

    // Caca is right: the round is hers.
    expect(await buzz(caca.id, q1, true)).toMatchObject({
      accepted: true,
      won: true,
      points: 1000,
    });
    expect((await session(sessionId)).phase).toBe("reveal");

    const rows = await asHost((tx) =>
      tx.query<{ nickname: string; score: number }>(
        "select nickname, score from public.participants where session_id = $1 order by nickname",
        [sessionId],
      ),
    );
    expect(rows.rows.map((r) => [r.nickname, r.score])).toEqual([
      ["Ani", 200],
      ["Budi", 200], // the timeout cost the penalty too
      ["Caca", 1300],
    ]);
  });

  it("refuses an answer after the hold ran out", async () => {
    const sessionId = await newSession("battle_buzzer", { variant: "buzz_then_answer" });
    const ani = await join(sessionId, "Ani");
    await openRound(sessionId);
    await buzzIn(ani.id);
    await db.query(
      `update public.buzzer_holds h set expires_at = now() - interval '2 seconds'
         from public.battle_rounds r where r.id = h.round_id and r.session_id = $1`,
      [sessionId],
    );
    expect(await buzz(ani.id, q1, true)).toMatchObject({ accepted: false, reason: "hold_expired" });
    expect(await hold(sessionId)).toBeNull();
  });

  it("is only for the buzz variant and the service role", async () => {
    const sessionId = await newSession();
    const ani = await join(sessionId, "Ani");
    await openRound(sessionId);
    await expect(buzzIn(ani.id)).rejects.toThrow(/wrong_mode/);
    await expect(
      as(db, user(host), (tx) => tx.query("select public.buzz_in($1, $2)", [ani.id, q1])),
    ).rejects.toThrow(/permission denied/);
  });
});
