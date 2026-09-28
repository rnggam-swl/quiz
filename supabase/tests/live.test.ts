import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

let db: PGlite;
let host: string;
let otherHost: string;
let quizId: string;
let versionId: string;
let q1: string;
let q2: string;
let q3: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

type Session = {
  id: string;
  phase: string;
  status: string;
  state_version: number;
  current_round: number | null;
  phase_closes_at: string | null;
  paused_at: string | null;
  paused_remaining_ms: number | null;
};

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "guru@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  q1 = crypto.randomUUID();
  q2 = crypto.randomUUID();
  q3 = crypto.randomUUID();

  ({ quizId, versionId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Kuis Live') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          {
            id: q1,
            type: "true_false",
            prompt: "A?",
            config: { correct: true },
            points: 1000,
            time_limit_s: 10,
          },
          { id: q2, type: "true_false", prompt: "B?", config: { correct: false }, points: 1000 },
          { id: q3, type: "true_false", prompt: "C?", config: { correct: true }, points: 2000 },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'kuis-live-ab1')", [id]);
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

/** A fresh live session in the lobby (committed, so each test starts clean). */
async function newSession(policy: Record<string, unknown> = {}): Promise<string> {
  return as(
    db,
    user(host),
    async (tx) =>
      (
        await one<{ id: string }>(
          tx,
          `insert into public.sessions
             (quiz_id, quiz_version_id, mode, status, phase, code, policy, seed, question_ids)
           values ($1, $2, 'live', 'lobby', 'lobby', public.generate_session_code(), $3, 42, $4)
           returning id`,
          [
            quizId,
            versionId,
            JSON.stringify({ timer: { perQuestionS: 20 }, ...policy }),
            [q1, q2, q3],
          ],
        )
      ).id,
    { commit: true },
  );
}

const join = (tx: Transaction, sessionId: string, nickname: string) =>
  one<{ id: string; nickname: string; is_spectator: boolean }>(
    tx,
    "select id, nickname, is_spectator from public.join_live($1, $2)",
    [sessionId, nickname],
  );

const advance = (tx: Transaction, sessionId: string, version: number, action = "next") =>
  one<Session>(tx, "select * from public.advance_live($1, $2, $3)", [sessionId, version, action]);

/**
 * Answer `elapsedS` seconds after the round opened. now() is fixed within a transaction,
 * so moving opened_at in the same transaction makes the elapsed time exact.
 */
async function answer(
  tx: Transaction,
  participantId: string,
  questionId: string,
  correct: number,
  elapsedS = 0,
) {
  await tx.query(
    `update public.battle_rounds r set opened_at = now() - make_interval(secs => $2)
       from public.participants p
      where p.id = $1 and r.session_id = p.session_id and r.status = 'open'`,
    [participantId, elapsedS],
  );
  const row = await one<{
    result: { points: number; bonus: number; streak: number; timeMs: number };
  }>(tx, "select public.record_live_answer($1, $2, $3, $4, 1, $5) as result", [
    participantId,
    questionId,
    JSON.stringify({ value: correct === 1 }),
    correct,
    1000,
  ]);
  return row.result;
}

const state = (tx: Transaction, sessionId: string, participantId: string | null = null) =>
  one<{ state: Record<string, unknown> & { top: Row[]; you?: Row } }>(
    tx,
    "select public.live_state($1, $2) as state",
    [sessionId, participantId],
  ).then((r) => r.state);

/** Run as the host, then as the service role, in one committed step each. */
const asHost = <T>(fn: (tx: Transaction) => Promise<T>) => as(db, user(host), fn, { commit: true });
const asService = <T>(fn: (tx: Transaction) => Promise<T>) => as(db, service, fn, { commit: true });
const superuser = (sql: string, params: unknown[] = []) => db.query(sql, params);

/** Lobby → countdown → open for the given round. */
async function openRound(sessionId: string) {
  let s = await asHost((tx) =>
    one<Session>(tx, "select * from public.sessions where id = $1", [sessionId]),
  );
  if (s.phase === "lobby" || s.phase === "leaderboard")
    s = await asHost((tx) => advance(tx, sessionId, s.state_version));
  return asHost((tx) => advance(tx, sessionId, s.state_version));
}

describe("join_live", () => {
  it("gives each participant a unique nickname and an attempt", async () => {
    const sessionId = await newSession();
    await asService(async (tx) => {
      const a = await join(tx, sessionId, "Budi");
      const b = await join(tx, sessionId, "budi");
      expect(a.nickname).toBe("Budi");
      expect(b.nickname).toBe("budi 2");
      const attempt = await one<{ question_ids: string[]; seed: string }>(
        tx,
        "select question_ids, seed from public.attempts where participant_id = $1",
        [a.id],
      );
      expect(attempt.question_ids).toEqual([q1, q2, q3]);
      expect(Number(attempt.seed)).toBe(42);
    });
  });

  it("is service_role only", async () => {
    const sessionId = await newSession();
    await expect(as(db, anon, (tx) => join(tx, sessionId, "X"))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, user(host), (tx) => join(tx, sessionId, "X"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("refuses a locked lobby and follows the late-join policy", async () => {
    const locked = await newSession();
    await asHost((tx) => tx.query("select public.update_live_settings($1, true, null)", [locked]));
    await expect(asService((tx) => join(tx, locked, "Telat"))).rejects.toThrow(/lobby_locked/);

    const deny = await newSession({ lateJoin: "deny" });
    await openRound(deny);
    await expect(asService((tx) => join(tx, deny, "Telat"))).rejects.toThrow(/late_join_closed/);

    const watch = await newSession({ lateJoin: "spectator" });
    await openRound(watch);
    const spectator = await asService((tx) => join(tx, watch, "Penonton"));
    expect(spectator.is_spectator).toBe(true);
    await expect(asService((tx) => answer(tx, spectator.id, q1, 1))).rejects.toThrow(/spectator/);

    const allow = await newSession();
    await openRound(allow);
    expect((await asService((tx) => join(tx, allow, "Telat"))).is_spectator).toBe(false);
  });
});

describe("advance_live", () => {
  it("walks lobby → countdown → open → reveal → leaderboard → … → podium → ended", async () => {
    const sessionId = await newSession();
    const p = await asService((tx) => join(tx, sessionId, "Ani"));
    const phases: string[] = [];
    let s = await asHost((tx) =>
      one<Session>(tx, "select * from public.sessions where id = $1", [sessionId]),
    );
    while (s.phase !== "ended") {
      s = await asHost((tx) => advance(tx, sessionId, s.state_version));
      phases.push(`${s.phase}${s.current_round ?? ""}`);
    }
    expect(phases).toEqual([
      "countdown0",
      "open0",
      "reveal0",
      "leaderboard0",
      "countdown1",
      "open1",
      "reveal1",
      "leaderboard1",
      "countdown2",
      "open2",
      "reveal2",
      "leaderboard2",
      "podium2",
      "ended2",
    ]);
    expect(s.status).toBe("ended");
    const attempt = await asHost((tx) =>
      one<{ status: string }>(tx, "select status from public.attempts where participant_id = $1", [
        p.id,
      ]),
    );
    expect(attempt.status).toBe("submitted");
  });

  it("uses the question's own time limit, else the session timer", async () => {
    const sessionId = await newSession();
    await openRound(sessionId);
    const rounds = await asHost((tx) =>
      tx.query<{ idx: number; time_limit_ms: number; status: string }>(
        "select idx, time_limit_ms, status from public.battle_rounds where session_id = $1",
        [sessionId],
      ),
    );
    expect(rounds.rows).toEqual([{ idx: 0, time_limit_ms: 10_000, status: "open" }]);
  });

  it("ignores stale versions, early timer calls and other hosts", async () => {
    const sessionId = await newSession();
    const s = await asHost((tx) => advance(tx, sessionId, 0));
    expect(s.phase).toBe("countdown");
    // A second tab still on version 0: nothing happens.
    expect((await asHost((tx) => advance(tx, sessionId, 0))).phase).toBe("countdown");
    // The countdown timer hasn't run out yet.
    expect((await asHost((tx) => advance(tx, sessionId, s.state_version, "auto"))).phase).toBe(
      "countdown",
    );
    await superuser(
      "update public.sessions set phase_closes_at = now() - interval '1 second' where id = $1",
      [sessionId],
    );
    expect((await asHost((tx) => advance(tx, sessionId, s.state_version, "auto"))).phase).toBe(
      "open",
    );
    await expect(as(db, user(otherHost), (tx) => advance(tx, sessionId, 2))).rejects.toThrow(
      /session_not_found/,
    );
  });

  it("pauses and resumes the timer without costing speed points", async () => {
    const sessionId = await newSession();
    const open = await openRound(sessionId);
    const paused = await asHost((tx) => advance(tx, sessionId, open.state_version, "pause"));
    expect(paused.paused_at).not.toBeNull();
    expect(paused.phase_closes_at).toBeNull();
    expect(paused.paused_remaining_ms).toBeGreaterThan(9000);
    // The pause lasted 30 seconds.
    await superuser(
      "update public.sessions set paused_at = now() - interval '30 seconds' where id = $1",
      [sessionId],
    );
    const resumed = await asHost((tx) => advance(tx, sessionId, paused.state_version, "resume"));
    expect(resumed.paused_at).toBeNull();
    const round = await asHost((tx) =>
      one<{ opened_at: string; closes_at: string }>(
        tx,
        "select opened_at, closes_at from public.battle_rounds where session_id = $1",
        [sessionId],
      ),
    );
    // opened_at moved forward by the pause, so an answer now counts as ~0 s.
    expect(Date.parse(round.opened_at)).toBeGreaterThan(Date.now() - 5000);
    expect(Date.parse(round.closes_at) - Date.now()).toBeGreaterThan(8000);
  });

  it("ends from the middle of a game on the podium, and from the podium for good", async () => {
    const sessionId = await newSession();
    const open = await openRound(sessionId);
    const podium = await asHost((tx) => advance(tx, sessionId, open.state_version, "end"));
    expect(podium.phase).toBe("podium");
    const ended = await asHost((tx) => advance(tx, sessionId, podium.state_version, "end"));
    expect(ended.phase).toBe("ended");
    expect(ended.status).toBe("ended");
    await expect(asService((tx) => join(tx, sessionId, "Telat"))).rejects.toThrow(/session_closed/);
  });
});

describe("record_live_answer", () => {
  it("awards speed points from the database clock and a streak bonus", async () => {
    const sessionId = await newSession();
    const fast = await asService((tx) => join(tx, sessionId, "Cepat"));
    const slow = await asService((tx) => join(tx, sessionId, "Lambat"));
    await openRound(sessionId);

    // Answered right away: full points.
    expect((await asService((tx) => answer(tx, fast.id, q1, 1))).points).toBe(1000);
    // Five of ten seconds gone: 1000 × (1 − 0.5 / 2) = 750.
    const late = await asService((tx) => answer(tx, slow.id, q1, 1, 5));
    expect(late.points).toBe(750);
    expect(late.timeMs).toBe(5000);

    await expect(asService((tx) => answer(tx, fast.id, q1, 1))).rejects.toThrow(/already_answered/);

    // Second correct answer in a row: +100.
    let s = await asHost((tx) =>
      one<Session>(tx, "select * from public.sessions where id = $1", [sessionId]),
    );
    s = await asHost((tx) => advance(tx, sessionId, s.state_version)); // reveal
    s = await asHost((tx) => advance(tx, sessionId, s.state_version)); // leaderboard
    await openRound(sessionId);
    const second = await asService((tx) => answer(tx, fast.id, q2, 1));
    expect(second.streak).toBe(2);
    expect(second.bonus).toBe(100);
    expect(second.points).toBe(1100);
    // A wrong answer resets the streak and scores nothing.
    const wrong = await asService((tx) => answer(tx, slow.id, q2, 0));
    expect(wrong).toMatchObject({ points: 0, streak: 0, bonus: 0 });

    const scores = await asHost((tx) =>
      tx.query<{ nickname: string; score: number; streak: number }>(
        "select nickname, score, streak from public.participants where session_id = $1 order by score desc",
        [sessionId],
      ),
    );
    expect(scores.rows).toEqual([
      { nickname: "Cepat", score: 2100, streak: 2 },
      { nickname: "Lambat", score: 750, streak: 0 },
    ]);
  });

  it("refuses answers outside the open round, after the deadline, and from kicked players", async () => {
    const sessionId = await newSession();
    const p = await asService((tx) => join(tx, sessionId, "Rina"));
    const kicked = await asService((tx) => join(tx, sessionId, "Usil"));
    await expect(asService((tx) => answer(tx, p.id, q1, 1))).rejects.toThrow(/round_closed/);

    await openRound(sessionId);
    await expect(asService((tx) => answer(tx, p.id, q2, 1))).rejects.toThrow(/round_closed/);

    await asHost((tx) =>
      tx.query("select public.kick_participant($1, $2)", [sessionId, kicked.id]),
    );
    await expect(asService((tx) => answer(tx, kicked.id, q1, 1))).rejects.toThrow(/kicked/);

    await superuser(
      "update public.battle_rounds set closes_at = now() - interval '2 seconds' where session_id = $1",
      [sessionId],
    );
    await expect(asService((tx) => answer(tx, p.id, q1, 1))).rejects.toThrow(/deadline_passed/);
  });

  it("breaks the streak of whoever didn't answer when the round is revealed", async () => {
    const sessionId = await newSession();
    const p = await asService((tx) => join(tx, sessionId, "Doni"));
    await superuser("update public.participants set streak = 3 where id = $1", [p.id]);
    const open = await openRound(sessionId);
    await asHost((tx) => advance(tx, sessionId, open.state_version));
    const row = await asHost((tx) =>
      one<{ streak: number }>(tx, "select streak from public.participants where id = $1", [p.id]),
    );
    expect(row.streak).toBe(0);
  });
});

describe("live_state", () => {
  it("shows the host counts, and the top 5 with the points just won", async () => {
    const sessionId = await newSession();
    const players = await asService(async (tx) => [
      await join(tx, sessionId, "Ani"),
      await join(tx, sessionId, "Budi"),
      await join(tx, sessionId, "Caca"),
    ]);
    // Before this round Budi leads; Ani overtakes him.
    await superuser("update public.participants set score = 900 where id = $1", [players[1]!.id]);
    const open = await openRound(sessionId);
    await asService((tx) => answer(tx, players[0]!.id, q1, 1));

    const during = await asHost((tx) => state(tx, sessionId));
    expect(during).toMatchObject({ phase: "open", round: 0, players: 3, answered: 1, top: [] });

    let s = await asHost((tx) => advance(tx, sessionId, open.state_version));
    s = await asHost((tx) => advance(tx, sessionId, s.state_version));
    const board = await asHost((tx) => state(tx, sessionId));
    expect(board.phase).toBe("leaderboard");
    expect(board.top.map((t) => [t.nickname, t.score, t.delta, t.rank, t.prevRank])).toEqual([
      ["Ani", 1000, 1000, 1, 2],
      ["Budi", 900, 0, 2, 1],
      // Ani and Caca were tied at 0 before the round: both 2nd.
      ["Caca", 0, 0, 3, 2],
    ]);

    expect(await as(db, user(otherHost), (tx) => state(tx, sessionId))).toBeNull();
  });

  it("tells a participant their rank and their own answer", async () => {
    const sessionId = await newSession();
    const a = await asService((tx) => join(tx, sessionId, "Ani"));
    const b = await asService((tx) => join(tx, sessionId, "Budi"));
    await openRound(sessionId);
    await asService((tx) => answer(tx, b.id, q1, 1));
    const you = (await asService((tx) => state(tx, sessionId, b.id))).you!;
    expect(you).toMatchObject({ nickname: "Budi", score: 1000, rank: 1, kicked: false });
    expect(you.answer).toMatchObject({ correct: 1, total: 1, points: 1000 });
    const other = (await asService((tx) => state(tx, sessionId, a.id))).you!;
    expect(other).toMatchObject({ rank: 2, answer: null });
  });

  it("drops kicked participants from the counts", async () => {
    const sessionId = await newSession();
    const p = await asService((tx) => join(tx, sessionId, "Usil"));
    await asService((tx) => join(tx, sessionId, "Baik"));
    const before = await asHost((tx) => state(tx, sessionId));
    await asHost((tx) => tx.query("select public.kick_participant($1, $2)", [sessionId, p.id]));
    const after = await asHost((tx) => state(tx, sessionId));
    expect(before.players).toBe(2);
    expect(after.players).toBe(1);
    expect(Number(after.version)).toBe(Number(before.version) + 1);
    const you = (await asService((tx) => state(tx, sessionId, p.id))).you!;
    expect(you.kicked).toBe(true);
  });
});
