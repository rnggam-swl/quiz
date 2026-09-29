import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser, service, user } from "./db";

let db: PGlite;
let host: string;
let quizId: string;
let versionId: string;
const q: string[] = [];

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

type Session = { id: string; phase: string; state_version: number; current_round: number | null };
type Player = {
  nickname: string;
  lives: number | null;
  is_spectator: boolean;
  eliminated_round: number | null;
  score: number;
  shadow_score: number;
};

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "guru@sekolah.id" });
  for (let i = 0; i < 3; i++) q.push(crypto.randomUUID());
  ({ quizId, versionId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Royale') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify(
          q.map((qid, i) => ({
            id: qid,
            type: "true_false",
            prompt: `S${i}?`,
            config: { correct: true },
            points: 1000,
          })),
        ),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'royale-ab1')", [id]);
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

async function newSession(royale: Record<string, unknown> = {}, questions = q): Promise<string> {
  const policy = {
    timer: { perQuestionS: 20 },
    lateJoin: "spectator",
    royale: { lives: 3, eliminateSlowest: false, shrinkTimerPct: 10, suddenDeath: true, ...royale },
  };
  return asHost(
    async (tx) =>
      (
        await one<{ id: string }>(
          tx,
          `insert into public.sessions
           (quiz_id, quiz_version_id, mode, status, phase, code, policy, seed, question_ids)
         values ($1, $2, 'battle_royale', 'lobby', 'lobby', public.generate_session_code(), $3, 1, $4)
         returning id`,
          [quizId, versionId, JSON.stringify(policy), questions],
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

async function next(sessionId: string): Promise<Session> {
  const s = await session(sessionId);
  return asHost((tx) =>
    one<Session>(tx, "select * from public.advance_live($1, $2, 'next')", [
      sessionId,
      s.state_version,
    ]),
  );
}

/** From the lobby or the leaderboard to an open round. */
async function openRound(sessionId: string) {
  await next(sessionId); // countdown
  return next(sessionId); // open
}

/** Answer `elapsedS` seconds after the round opened (exact: same transaction). */
const answer = (participantId: string, questionId: string, correct: boolean, elapsedS = 0) =>
  asService(async (tx) => {
    await tx.query(
      `update public.battle_rounds r set opened_at = now() - make_interval(secs => $2)
         from public.participants p
        where p.id = $1 and r.session_id = p.session_id and r.status = 'open'`,
      [participantId, elapsedS],
    );
    return one<{ result: { accepted: boolean; shadow: boolean } }>(
      tx,
      "select public.record_royale_answer($1, $2, $3, $4, 1, 1000) as result",
      [participantId, questionId, JSON.stringify({ value: correct }), correct ? 1 : 0],
    ).then((r) => r.result);
  });

const players = (sessionId: string) =>
  asHost((tx) =>
    tx
      .query<Player>(
        `select nickname, lives, is_spectator, eliminated_round, score, shadow_score
           from public.participants where session_id = $1 order by nickname`,
        [sessionId],
      )
      .then((r) => r.rows),
  );

const byName = async (sessionId: string) =>
  Object.fromEntries((await players(sessionId)).map((p) => [p.nickname, p]));

const state = (sessionId: string, participantId: string | null = null) =>
  asService((tx) =>
    one<{ state: Row & { royale: Row; top: Row[]; you?: Row } }>(
      tx,
      "select public.live_state($1, $2) as state",
      [sessionId, participantId],
    ),
  ).then((r) => r.state);

describe("royale lives", () => {
  it("gives every player their lives at the start; late joiners only watch (P7-02, P7-14)", async () => {
    const sessionId = await newSession();
    await join(sessionId, "Ani");
    await join(sessionId, "Budi");
    await openRound(sessionId);
    await join(sessionId, "Telat");
    const p = await byName(sessionId);
    expect(p.Ani).toMatchObject({ lives: 3, is_spectator: false });
    expect(p.Telat).toMatchObject({ lives: null, is_spectator: true, eliminated_round: null });
  });

  it("takes a life from the wrong and the silent when the round locks (P7-03)", async () => {
    const sessionId = await newSession();
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await join(sessionId, "Caca");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, true);
    await answer(budi.id, q[0]!, false);
    await next(sessionId); // reveal: resolve
    const p = await byName(sessionId);
    expect([p.Ani!.lives, p.Budi!.lives, p.Caca!.lives]).toEqual([3, 2, 2]);
  });

  it("eliminates at zero lives, and one survivor goes straight to the podium (P7-03, P7-04)", async () => {
    const sessionId = await newSession({ lives: 1 });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, true);
    await answer(budi.id, q[0]!, false);
    await next(sessionId); // reveal
    const p = await byName(sessionId);
    expect(p.Budi).toMatchObject({ lives: 0, is_spectator: true, eliminated_round: 0 });
    expect(p.Ani).toMatchObject({ lives: 1, is_spectator: false });

    const reveal = await state(sessionId);
    expect(reveal.royale).toMatchObject({ remaining: 1, total: 2 });
    expect(reveal.royale.eliminated).toEqual([expect.objectContaining({ nickname: "Budi" })]);
    expect((await next(sessionId)).phase).toBe("podium");
    const podium = await state(sessionId);
    expect(podium.top.map((t) => [t.nickname, t.rank])).toEqual([
      ["Ani", 1],
      ["Budi", 2],
    ]);
  });

  it("knocks nobody out when every survivor would go in the same round (P7-04)", async () => {
    const sessionId = await newSession({ lives: 1 });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, false);
    await answer(budi.id, q[0]!, false);
    await next(sessionId);
    const p = await byName(sessionId);
    expect([p.Ani, p.Budi].map((x) => [x!.lives, x!.is_spectator])).toEqual([
      [1, false],
      [1, false],
    ]);
    expect((await next(sessionId)).phase).toBe("leaderboard");
  });

  it("takes a life from the slowest when everyone was right, if asked (eliminateSlowest)", async () => {
    const sessionId = await newSession({ lives: 2, eliminateSlowest: true });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, true, 2);
    await answer(budi.id, q[0]!, true, 7);
    await next(sessionId);
    const p = await byName(sessionId);
    expect([p.Ani!.lives, p.Budi!.lives]).toEqual([2, 1]);
  });
});

describe("the zone and the end", () => {
  it("shrinks each round's time, never under 5 seconds (P7-06)", async () => {
    const sessionId = await newSession({ shrinkTimerPct: 50, lives: 5 });
    const ani = await join(sessionId, "Ani");
    await join(sessionId, "Budi");
    const limits: number[] = [];
    for (let r = 0; r < 3; r++) {
      await openRound(sessionId);
      await answer(ani.id, q[r]!, true);
      await next(sessionId); // reveal
      await next(sessionId); // leaderboard
    }
    const rows = await asHost((tx) =>
      tx.query<{ time_limit_ms: number }>(
        "select time_limit_ms from public.battle_rounds where session_id = $1 order by idx",
        [sessionId],
      ),
    );
    for (const r of rows.rows) limits.push(r.time_limit_ms);
    expect(limits).toEqual([20_000, 10_000, 5000]);
  });

  it("plays sudden death when the questions run out: 5 seconds, one mistake and you're out (P7-05)", async () => {
    const sessionId = await newSession({ lives: 3 }, [q[0]!]);
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, true);
    await answer(budi.id, q[0]!, true);
    await next(sessionId); // reveal
    await next(sessionId); // leaderboard
    await openRound(sessionId); // round 1: sudden death, question 0 again
    const s = await state(sessionId);
    expect(s.royale).toMatchObject({ suddenDeath: true });
    expect(s).toMatchObject({ timeLimitMs: 5000, questionId: q[0] });
    await answer(ani.id, q[0]!, true);
    await answer(budi.id, q[0]!, false);
    await next(sessionId);
    const p = await byName(sessionId);
    expect(p.Budi).toMatchObject({ lives: 0, is_spectator: true, eliminated_round: 1 });
  });

  it("ranks by lives when the questions run out without sudden death (P7-05)", async () => {
    const sessionId = await newSession({ lives: 3, suddenDeath: false }, [q[0]!]);
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, true);
    await answer(budi.id, q[0]!, false);
    await next(sessionId); // reveal
    await next(sessionId); // leaderboard
    expect((await next(sessionId)).phase).toBe("podium");
    const top = (await state(sessionId)).top;
    expect(top.map((t) => [t.nickname, t.rank, t.lives])).toEqual([
      ["Ani", 1, 3],
      ["Budi", 2, 2],
    ]);
  });
});

describe("spectators", () => {
  it("earn shadow points without touching lives or the count of answers (P7-07)", async () => {
    const sessionId = await newSession({ lives: 1 });
    const ani = await join(sessionId, "Ani");
    const budi = await join(sessionId, "Budi");
    const caca = await join(sessionId, "Caca");
    await openRound(sessionId);
    await answer(ani.id, q[0]!, true);
    await answer(caca.id, q[0]!, true);
    await answer(budi.id, q[0]!, false);
    await next(sessionId); // Budi is out
    await next(sessionId); // leaderboard
    await openRound(sessionId);

    expect(await answer(budi.id, q[1]!, true)).toEqual({ accepted: true, shadow: true });
    const during = await state(sessionId, budi.id);
    expect(during).toMatchObject({ players: 2, answered: 0 });
    expect(during.you).toMatchObject({ spectator: true, lives: 0, eliminatedRound: 0 });
    const p = await byName(sessionId);
    expect(p.Budi!.shadow_score).toBeGreaterThan(0);
    expect(p.Budi!.score).toBe(0);
  });
});

describe("simulation", () => {
  it("100 bots with random accuracy always end with exactly one winner (P7-16)", async () => {
    // Deterministic PRNG so a failure can be replayed.
    let seed = 20260930;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const sessionId = await newSession({ lives: 3, eliminateSlowest: true, shrinkTimerPct: 10 });
    const ids: { id: string; skill: number }[] = [];
    for (let i = 0; i < 100; i++) {
      ids.push({ ...(await join(sessionId, `Bot ${i}`)), skill: 0.3 + random() * 0.65 });
    }

    let steps = 0;
    let s = await next(sessionId); // countdown
    while (s.phase !== "podium" && steps < 200) {
      steps++;
      if (s.phase === "open") {
        const round = await asService((tx) =>
          one<{ question_id: string }>(
            tx,
            "select question_id from public.battle_rounds where session_id = $1 and idx = $2",
            [sessionId, s.current_round],
          ),
        );
        const alive = new Set(
          (
            await asService((tx) =>
              tx.query<{ id: string }>(
                "select id from public.participants where session_id = $1 and not is_spectator",
                [sessionId],
              ),
            )
          ).rows.map((r) => r.id),
        );
        for (const bot of ids) {
          // Some bots are silent; spectators sometimes play along.
          if (random() < (alive.has(bot.id) ? 0.05 : 0.6)) continue;
          await answer(bot.id, round.question_id, random() < bot.skill, random() * 4);
        }
      }
      s = await next(sessionId);
    }
    expect(s.phase).toBe("podium");

    const standings = await asHost((tx) =>
      tx.query<{ rank: number | null; alive: boolean }>(
        "select rank, alive from public.royale_standings($1)",
        [sessionId],
      ),
    );
    const ranks = standings.rows.map((r) => r.rank).filter((r): r is number => r !== null);
    expect(ranks.filter((r) => r === 1)).toHaveLength(1);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(standings.rows.filter((r) => r.alive).length).toBeGreaterThanOrEqual(1);
  }, 120_000);
});
