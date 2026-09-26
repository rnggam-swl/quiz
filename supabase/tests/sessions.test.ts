import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

let db: PGlite;
let host: string;
let otherHost: string;
let quizId: string;
let versionId: string;
let sessionId: string;
let q1: string;
let q2: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "host@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  q1 = crypto.randomUUID();
  q2 = crypto.randomUUID();

  ({ quizId, versionId, sessionId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Kuis Latihan') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          { id: q1, type: "true_false", prompt: "A?", config: { correct: true } },
          { id: q2, type: "true_false", prompt: "B?", config: { correct: false } },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'kuis-latihan-ab1')", [id]);
      const version = await one<{ id: string }>(
        tx,
        "select id from public.quiz_versions where quiz_id = $1",
        [id],
      );
      const session = await one<{ id: string }>(
        tx,
        "select id from public.ensure_practice_session($1)",
        [id],
      );
      return { quizId: id, versionId: version.id, sessionId: session.id };
    },
    { commit: true },
  ));
}, 60_000);

const join = (tx: Transaction, nickname: string, external: string | null = null) =>
  one<{ id: string; nickname: string }>(
    tx,
    "select id, nickname from public.join_session($1, $2, $3)",
    [sessionId, nickname, external],
  );

const start = (
  tx: Transaction,
  participantId: string,
  maxAttempts = 0,
  duration: number | null = null,
) =>
  one<{ id: string; attempt_no: number; status: string }>(
    tx,
    "select id, attempt_no, status from public.start_attempt($1, $2, 42, $3, $4, $5)",
    [participantId, versionId, [q1, q2], maxAttempts, duration],
  );

const record = (
  tx: Transaction,
  attemptId: string,
  questionId: string,
  points: number,
  allowChange = false,
) =>
  one(tx, "select * from public.record_response($1, $2, $3, 1, 1, $4, 1200, $5)", [
    attemptId,
    questionId,
    { value: true },
    points,
    allowChange,
  ]);

describe("ensure_practice_session", () => {
  it("returns the same default session with a 6-digit code every time", async () => {
    await as(db, user(host), async (tx) => {
      const again = await one<{ id: string; code: string; mode: string }>(
        tx,
        "select id, code, mode from public.ensure_practice_session($1)",
        [quizId],
      );
      expect(again).toMatchObject({ id: sessionId, mode: "practice" });
      expect(again.code).toMatch(/^\d{6}$/);
    });
  });

  it("refuses unpublished quizzes and other people's quizzes", async () => {
    await expect(
      as(db, user(host), async (tx) => {
        const { id } = await one<{ id: string }>(
          tx,
          "insert into public.quizzes (title) values ('Draf') returning id",
        );
        await tx.query("select public.ensure_practice_session($1)", [id]);
      }),
    ).rejects.toThrow("not_published");
    await expect(
      as(db, user(otherHost), (tx) =>
        tx.query("select public.ensure_practice_session($1)", [quizId]),
      ),
    ).rejects.toThrow("quiz_not_found");
  });
});

describe("join_session", () => {
  it("dedupes nicknames case-insensitively", async () => {
    await as(db, service, async (tx) => {
      expect((await join(tx, "Budi")).nickname).toBe("Budi");
      expect((await join(tx, "budi")).nickname).toBe("budi 2");
      expect((await join(tx, "  Budi  ")).nickname).toBe("Budi 3");
    });
  });

  it("keeps long nicknames within 24 chars when adding a suffix", async () => {
    await as(db, service, async (tx) => {
      const long = "A".repeat(30);
      expect((await join(tx, long)).nickname).toBe("A".repeat(24));
      expect((await join(tx, long)).nickname).toBe(`${"A".repeat(22)} 2`);
    });
  });

  it("returns the same participant for the same external id (embed token)", async () => {
    await as(db, service, async (tx) => {
      const first = await join(tx, "Siti", "user-123");
      const again = await join(tx, "Siti lagi", "user-123");
      expect(again.id).toBe(first.id);
    });
  });

  it("rejects closed sessions and blank nicknames", async () => {
    await expect(
      as(db, service, async (tx) => {
        await tx.query("update public.sessions set status = 'ended' where id = $1", [sessionId]);
        await join(tx, "Telat");
      }),
    ).rejects.toThrow("session_closed");
    await expect(as(db, service, (tx) => join(tx, "   "))).rejects.toThrow("invalid_nickname");
  });

  it("is not callable by browsers (anon or signed-in)", async () => {
    await expect(as(db, anon, (tx) => join(tx, "x"))).rejects.toThrow(/permission denied/);
    await expect(as(db, user(host), (tx) => join(tx, "x"))).rejects.toThrow(/permission denied/);
  });
});

describe("start_attempt", () => {
  it("resumes the open attempt instead of starting another", async () => {
    await as(db, service, async (tx) => {
      const p = await join(tx, "Rina");
      const a = await start(tx, p.id);
      const b = await start(tx, p.id);
      expect(b.id).toBe(a.id);
      expect(a).toMatchObject({ attempt_no: 1, status: "in_progress" });
    });
  });

  it("numbers attempts and enforces the attempt limit", async () => {
    await expect(
      as(db, service, async (tx) => {
        const p = await join(tx, "Dodi");
        const first = await start(tx, p.id, 1);
        await tx.query("select public.submit_attempt($1, 2, 0, 0)", [first.id]);
        await start(tx, p.id, 1);
      }),
    ).rejects.toThrow("attempt_limit");

    await as(db, service, async (tx) => {
      const p = await join(tx, "Eka");
      const first = await start(tx, p.id, 0);
      await tx.query("select public.submit_attempt($1, 2, 0, 0)", [first.id]);
      expect((await start(tx, p.id, 0)).attempt_no).toBe(2);
    });
  });
});

describe("record_response", () => {
  it("stores an answer once when changes aren't allowed (instant feedback)", async () => {
    await expect(
      as(db, service, async (tx) => {
        const p = await join(tx, "Fajar");
        const a = await start(tx, p.id);
        await record(tx, a.id, q1, 1000);
        await record(tx, a.id, q1, 1000);
      }),
    ).rejects.toThrow("already_answered");
  });

  it("lets the answer change when allowed (feedback at the end)", async () => {
    await as(db, service, async (tx) => {
      const p = await join(tx, "Gita");
      const a = await start(tx, p.id);
      await record(tx, a.id, q1, 0, true);
      const changed = await record(tx, a.id, q1, 1000, true);
      expect(changed.points).toBe(1000);
    });
  });

  it("rejects questions outside the attempt, closed attempts and passed deadlines", async () => {
    await expect(
      as(db, service, async (tx) => {
        const a = await start(tx, (await join(tx, "Hadi")).id);
        await record(tx, a.id, crypto.randomUUID(), 1000);
      }),
    ).rejects.toThrow("unknown_question");

    await expect(
      as(db, service, async (tx) => {
        const a = await start(tx, (await join(tx, "Indah")).id);
        await tx.query("select public.submit_attempt($1, 2, 0, 0)", [a.id]);
        await record(tx, a.id, q1, 1000);
      }),
    ).rejects.toThrow("attempt_closed");

    await expect(
      as(db, service, async (tx) => {
        const a = await start(tx, (await join(tx, "Joko")).id, 0, 60);
        await tx.query(
          "update public.attempts set deadline = now() - interval '1 minute' where id = $1",
          [a.id],
        );
        await record(tx, a.id, q1, 1000);
      }),
    ).rejects.toThrow("deadline_passed");
  });
});

describe("submit_attempt", () => {
  it("totals points and is idempotent", async () => {
    await as(db, service, async (tx) => {
      const a = await start(tx, (await join(tx, "Kiki")).id);
      await record(tx, a.id, q1, 1000);
      await record(tx, a.id, q2, 500);
      const done = await one<{ status: string; score: string; max_score: string; xp: number }>(
        tx,
        "select status, score, max_score, xp from public.submit_attempt($1, 2000, 25, 2)",
        [a.id],
      );
      expect(done).toMatchObject({ status: "submitted", xp: 25 });
      expect(Number(done.score)).toBe(1500);
      expect(Number(done.max_score)).toBe(2000);

      const again = await one<{ status: string }>(
        tx,
        "select status from public.submit_attempt($1, 9999, 0, 0)",
        [a.id],
      );
      expect(again.status).toBe("submitted");
    });
  });
});

describe("RLS on session data", () => {
  it("hosts see their own sessions' participants and attempts, nobody else does", async () => {
    await as(
      db,
      service,
      async (tx) => {
        const p = await join(tx, "Terlihat");
        await start(tx, p.id);
      },
      { commit: true },
    );

    const mine = await as(db, user(host), async (tx) => ({
      participants: (await tx.query("select nickname from public.participants")).rows.length,
      attempts: (await tx.query("select id from public.attempts")).rows.length,
      sessions: (await tx.query("select id from public.sessions")).rows.length,
    }));
    expect(mine.participants).toBeGreaterThan(0);
    expect(mine.attempts).toBeGreaterThan(0);
    expect(mine.sessions).toBe(1);

    const theirs = await as(db, user(otherHost), async (tx) => ({
      participants: (await tx.query("select id from public.participants")).rows.length,
      sessions: (await tx.query("select id from public.sessions")).rows.length,
      responses: (await tx.query("select id from public.responses")).rows.length,
    }));
    expect(theirs).toEqual({ participants: 0, sessions: 0, responses: 0 });

    await expect(
      as(db, anon, (tx) => tx.query("select * from public.participants")),
    ).rejects.toThrow(/permission denied/);
  });

  it("hosts can't write participants or responses directly", async () => {
    await expect(
      as(db, user(host), (tx) =>
        tx.query("insert into public.participants (session_id, nickname) values ($1, 'palsu')", [
          sessionId,
        ]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it("embed secrets are private to the quiz owner", async () => {
    await as(
      db,
      user(host),
      (tx) =>
        tx.query("insert into public.quiz_embed_secrets (quiz_id, secret) values ($1, $2)", [
          quizId,
          "s".repeat(40),
        ]),
      { commit: true },
    );
    const seen = await as(
      db,
      user(otherHost),
      async (tx) => (await tx.query("select * from public.quiz_embed_secrets")).rows,
    );
    expect(seen).toEqual([]);
  });
});
