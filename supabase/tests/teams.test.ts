import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser, service, user } from "./db";

// P8-02 · Mode tim: teams per session, auto/choose, shuffle, scores, one answer per team.

let db: PGlite;
let host: string;
let otherHost: string;
let quizId: string;
let versionId: string;
let q1: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

type Team = {
  id: string;
  slot: number;
  name: string;
  members: number;
  score: number;
  rank: number;
};

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "guru@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  q1 = crypto.randomUUID();
  ({ quizId, versionId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Tim') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          { id: q1, type: "true_false", prompt: "A?", config: { correct: true }, points: 1000 },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'tim-ab1')", [id]);
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

async function newSession(mode: string, policy: Record<string, unknown>): Promise<string> {
  return asHost(
    async (tx) =>
      (
        await one<{ id: string }>(
          tx,
          `insert into public.sessions
             (quiz_id, quiz_version_id, mode, status, phase, code, policy, seed, question_ids)
           values ($1, $2, $3, 'lobby', 'lobby', public.generate_session_code(), $4, 1, $5)
           returning id`,
          [quizId, versionId, mode, JSON.stringify(policy), [q1]],
        )
      ).id,
  );
}

/** Join (as the join action does: join_live, then auto placement). */
const join = (sessionId: string, nickname: string) =>
  asService(async (tx) => {
    const p = await one<{ id: string }>(tx, "select id from public.join_live($1, $2)", [
      sessionId,
      nickname,
    ]);
    await tx.query("select public.assign_teams($1, false)", [sessionId]);
    return p;
  });

const state = (sessionId: string, participantId: string | null = null) =>
  asService((tx) =>
    one<{ s: Row & { teams?: Team[]; you?: Row & { team?: Row }; teamsAnswered?: number } }>(
      tx,
      "select public.live_game_state($1, $2) as s",
      [sessionId, participantId],
    ).then((r) => r.s),
  );

const teamOf = (participantId: string) =>
  asService((tx) =>
    one<{ team_id: string | null }>(tx, "select team_id from public.participants where id = $1", [
      participantId,
    ]).then((r) => r.team_id),
  );

describe("teams", () => {
  it("are made with the session and fill up evenly in auto mode", async () => {
    const sessionId = await newSession("live", {
      teams: { enabled: true, count: 3, assign: "auto" },
    });
    const teams = await asHost((tx) =>
      tx
        .query<{ name: string; slot: number }>(
          "select name, slot from public.teams where session_id = $1 order by slot",
          [sessionId],
        )
        .then((r) => r.rows),
    );
    expect(teams).toEqual([
      { name: "Tim Merah", slot: 1 },
      { name: "Tim Biru", slot: 2 },
      { name: "Tim Kuning", slot: 3 },
    ]);
    for (const name of ["Ani", "Budi", "Caca", "Dodi", "Eka"]) await join(sessionId, name);
    const s = await state(sessionId);
    expect(s.teams!.map((t) => t.members)).toEqual([2, 2, 1]);
  });

  it("lets participants choose in 'choose' mode and places the rest at the start", async () => {
    const sessionId = await newSession("live", {
      teams: { enabled: true, count: 2, assign: "choose" },
    });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    expect(await teamOf(ani.id)).toBeNull();
    const [, blue] = await asHost((tx) =>
      tx
        .query<{ id: string }>("select id from public.teams where session_id = $1 order by slot", [
          sessionId,
        ])
        .then((r) => r.rows),
    );
    await asService((tx) => tx.query("select public.choose_team($1, $2)", [ani.id, blue!.id]));
    expect(await teamOf(ani.id)).toBe(blue!.id);

    // The host starts: Budi goes to the smaller (red) team.
    await asHost((tx) => tx.query("select public.assign_teams($1, true)", [sessionId]));
    expect(await teamOf(budi.id)).not.toBe(blue!.id);
    expect(await teamOf(budi.id)).not.toBeNull();

    // Not after the lobby.
    await db.query("update public.sessions set phase = 'open' where id = $1", [sessionId]);
    await expect(
      asService((tx) => tx.query("select public.choose_team($1, $2)", [budi.id, blue!.id])),
    ).rejects.toThrow("round_closed");
  });

  it("shuffles evenly, only for the session's host", async () => {
    const sessionId = await newSession("live", { teams: { enabled: true, count: 2 } });
    for (let i = 0; i < 7; i++) await join(sessionId, `P${i}`);
    await asHost((tx) => tx.query("select public.shuffle_teams($1)", [sessionId]));
    const sizes = (await state(sessionId)).teams!.map((t) => t.members).sort();
    expect(sizes).toEqual([3, 4]);
    await expect(
      as(db, user(otherHost), (tx) => tx.query("select public.shuffle_teams($1)", [sessionId])),
    ).rejects.toThrow("session_not_found");
  });

  it("scores live teams by their members' average, with ranks and the phone's own team", async () => {
    const sessionId = await newSession("live", { teams: { enabled: true, count: 2 } });
    const ani = await join(sessionId, "Ani"); // red
    const budi = await join(sessionId, "Budi"); // blue
    const caca = await join(sessionId, "Caca"); // red
    await db.query("update public.participants set score = 1000 where id = $1", [ani.id]);
    await db.query("update public.participants set score = 0 where id = $1", [caca.id]);
    await db.query("update public.participants set score = 800 where id = $1", [budi.id]);
    const s = await state(sessionId, caca.id);
    expect(s.teams!.map((t) => [t.name, t.score, t.rank])).toEqual([
      ["Tim Biru", 800, 1],
      ["Tim Merah", 500, 2],
    ]);
    expect(s.you!.team).toMatchObject({ name: "Tim Merah", slot: 1 });
  });

  it("gives each rebutan team one answer per question", async () => {
    const sessionId = await newSession("battle_buzzer", {
      teams: { enabled: true, count: 2 },
      buzzer: { graceMs: 0 },
    });
    const ani = await join(sessionId, "Ani"); // red
    const budi = await join(sessionId, "Budi"); // blue
    const caca = await join(sessionId, "Caca"); // red
    // Lobby → countdown → open (joining moved the version on).
    for (let step = 0; step < 2; step++) {
      await asHost(async (tx) => {
        const { state_version } = await one<{ state_version: number }>(
          tx,
          "select state_version from public.sessions where id = $1",
          [sessionId],
        );
        await tx.query("select public.advance_live($1, $2, 'next')", [sessionId, state_version]);
      });
    }
    const answer = (id: string, correct: boolean) =>
      asService((tx) =>
        one<{ r: Row }>(tx, "select public.record_battle_answer($1, $2, $3, $4, 1000, 0) as r", [
          id,
          q1,
          JSON.stringify({ value: correct }),
          correct,
        ]).then((r) => r.r),
      );
    expect(await answer(ani.id, false)).toMatchObject({ accepted: true, won: false });
    expect(await answer(caca.id, true)).toMatchObject({ accepted: false, reason: "team_answered" });
    expect((await state(sessionId)).teamsAnswered).toBe(1);
    expect(await answer(budi.id, true)).toMatchObject({ accepted: true, won: true });
    const teams = (await state(sessionId)).teams!;
    expect(teams[0]).toMatchObject({ name: "Tim Biru", score: 1000, rank: 1 });
  });

  it("stay out of sessions without teams", async () => {
    const sessionId = await newSession("live", {});
    await join(sessionId, "Ani");
    expect((await state(sessionId)).teams).toBeUndefined();
  });
});
