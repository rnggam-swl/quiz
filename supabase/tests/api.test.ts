import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

// P8-07 · API tokens and the api_* reads behind /api/v1.

let db: PGlite;
let host: string;
let otherHost: string;
let quizId: string;
let sessionId: string;
let q1: string;
let q2: string;
const attemptIds: string[] = [];

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "host@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  q1 = crypto.randomUUID();
  q2 = crypto.randomUUID();

  ({ quizId, sessionId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Kuis API') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          { id: q1, type: "true_false", prompt: "A?", config: { correct: true } },
          { id: q2, type: "true_false", prompt: "B?", config: { correct: false } },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'kuis-api-ab1')", [id]);
      const session = await one<{ id: string }>(
        tx,
        "select id from public.ensure_practice_session($1)",
        [id],
      );
      await tx.query(
        "insert into public.api_tokens (name, prefix, token_hash) values ('Moodle', 'qz_aaaa', $1)",
        [HASH_A],
      );
      return { quizId: id, sessionId: session.id };
    },
    { commit: true },
  ));

  // Five participants, one attempt each; the first two finish.
  await as(
    db,
    service,
    async (tx) => {
      const { id: versionId } = await one<{ id: string }>(
        tx,
        "select id from public.quiz_versions where quiz_id = $1",
        [quizId],
      );
      for (let i = 0; i < 5; i++) {
        const p = await one<{ id: string }>(tx, "select id from public.join_session($1, $2, $3)", [
          sessionId,
          `Siswa ${i + 1}`,
          i === 0 ? "lms-7" : null,
        ]);
        const a = await one<{ id: string }>(
          tx,
          "select id from public.start_attempt($1, $2, 42, $3, 0, null)",
          [p.id, versionId, [q1, q2]],
        );
        attemptIds.push(a.id);
        if (i < 2) {
          await tx.query(
            "select * from public.record_response($1, $2, $3, 1, 1, 1000, 900, false)",
            [a.id, q1, { value: true }],
          );
          await tx.query("select * from public.submit_attempt($1, 2000, 1, 1)", [a.id]);
        }
      }
    },
    { commit: true },
  );
}, 60_000);

describe("api_tokens", () => {
  it("owners see and revoke only their own tokens; nobody else sees them", async () => {
    await as(db, user(host), async (tx) => {
      const { rows } = await tx.query("select name from public.api_tokens");
      expect(rows).toEqual([{ name: "Moodle" }]);
    });
    await as(db, user(otherHost), async (tx) => {
      expect((await tx.query("select 1 from public.api_tokens")).rows).toHaveLength(0);
      const revoked = await tx.query(
        "update public.api_tokens set revoked_at = now() where token_hash = $1",
        [HASH_A],
      );
      expect(revoked.affectedRows).toBe(0);
    });
    await expect(as(db, anon, (tx) => tx.query("select 1 from public.api_tokens"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("can't be created for someone else, or with a malformed hash", async () => {
    await expect(
      as(db, user(otherHost), (tx) =>
        tx.query(
          "insert into public.api_tokens (owner_id, name, prefix, token_hash) values ($1, 'x', 'qz_xxxx', $2)",
          [host, HASH_B],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, user(host), (tx) =>
        tx.query(
          "insert into public.api_tokens (name, prefix, token_hash) values ('x', 'qz_xxxx', 'nothex')",
        ),
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it("only lets owners change revoked_at", async () => {
    await expect(
      as(db, user(host), (tx) =>
        tx.query("update public.api_tokens set name = 'Lain' where token_hash = $1", [HASH_A]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("api_authenticate", () => {
  const authenticate = (hash: string) =>
    as(db, service, async (tx) => {
      const { owner } = await one<{ owner: string | null }>(
        tx,
        "select public.api_authenticate($1) as owner",
        [hash],
      );
      const { rows } = await tx.query<{ used: string | null }>(
        "select last_used_at as used from public.api_tokens where token_hash = $1",
        [hash],
      );
      return { owner, used: rows[0]?.used ?? null };
    });

  it("resolves a live token to its owner and records the use", async () => {
    const { owner, used } = await authenticate(HASH_A);
    expect(owner).toBe(host);
    expect(used).not.toBeNull();
    expect((await authenticate(HASH_B)).owner).toBeNull();
  });

  it("rejects revoked and expired tokens", async () => {
    await as(db, service, async (tx) => {
      await tx.query("update public.api_tokens set revoked_at = now() where token_hash = $1", [
        HASH_A,
      ]);
      const revoked = await one<{ owner: string | null }>(
        tx,
        "select public.api_authenticate($1) as owner",
        [HASH_A],
      );
      expect(revoked.owner).toBeNull();
      await tx.query(
        "update public.api_tokens set revoked_at = null, expires_at = now() - interval '1 second' where token_hash = $1",
        [HASH_A],
      );
      const expired = await one<{ owner: string | null }>(
        tx,
        "select public.api_authenticate($1) as owner",
        [HASH_A],
      );
      expect(expired.owner).toBeNull();
    });
  });

  it("is only for the server", async () => {
    await expect(
      as(db, user(host), (tx) => tx.query("select public.api_authenticate($1)", [HASH_A])),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("api reads", () => {
  const call = <T>(sql: string, params: unknown[]) =>
    as(db, service, async (tx) => (await one<{ v: T }>(tx, sql, params)).v);

  it("lists only the owner's quizzes", async () => {
    const mine = await call<Row[]>("select public.api_quizzes($1) as v", [host]);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: quizId, title: "Kuis API", question_count: 2 });
    expect(await call<Row[]>("select public.api_quizzes($1) as v", [otherHost])).toEqual([]);
  });

  it("returns a quiz with questions (no answer keys) and sessions, only to its owner", async () => {
    const quiz = await call<Row>("select public.api_quiz($1, $2) as v", [host, quizId]);
    expect(quiz.questions).toEqual([
      { id: q1, position: 0, type: "true_false", prompt: "A?", points: 1000 },
      { id: q2, position: 1, type: "true_false", prompt: "B?", points: 1000 },
    ]);
    expect(JSON.stringify(quiz)).not.toContain("correct");
    expect(quiz.sessions).toEqual([
      expect.objectContaining({ id: sessionId, mode: "practice", participants: 5 }),
    ]);
    expect(await call("select public.api_quiz($1, $2) as v", [otherHost, quizId])).toBeNull();
  });

  it("pages through attempts with a cursor, oldest first", async () => {
    type Page = { data: Row[]; next: { started_at: string; id: string } | null };
    const seen: string[] = [];
    let next: Page["next"] = null;
    let pages = 0;
    do {
      const page: Page = await call<Page>(
        "select public.api_attempts($1, $2, null, null, null, $3, $4, 2) as v",
        [host, quizId, next?.started_at ?? null, next?.id ?? null],
      );
      seen.push(...page.data.map((r) => r.id as string));
      next = page.next;
      pages++;
    } while (next && pages < 10);
    expect(pages).toBe(3);
    expect(seen.toSorted()).toEqual(attemptIds.toSorted());
  });

  it("filters attempts by status and hides them from other owners", async () => {
    const done = await call<{ data: Row[] }>(
      "select public.api_attempts($1, $2, null, 'submitted', null, null, null, 100) as v",
      [host, quizId],
    );
    expect(done.data).toHaveLength(2);
    expect(done.data[0]).toMatchObject({
      status: "submitted",
      score: 1000,
      max_score: 2000,
      ratio: 0.5,
    });
    expect(await call("select public.api_attempts($1, $2) as v", [otherHost, quizId])).toBeNull();
  });

  it("returns one attempt with its answers and the participant's external id", async () => {
    const attempt = await call<Row>("select public.api_attempt($1, $2) as v", [
      host,
      attemptIds[0],
    ]);
    expect(attempt).toMatchObject({
      id: attemptIds[0],
      quiz_id: quizId,
      status: "submitted",
      participant: expect.objectContaining({ nickname: "Siswa 1", external_id: "lms-7" }),
    });
    expect(attempt.responses).toEqual([
      expect.objectContaining({
        question_id: q1,
        prompt: "A?",
        answer: { value: true },
        points: 1000,
      }),
    ]);
    expect(
      await call("select public.api_attempt($1, $2) as v", [otherHost, attemptIds[0]]),
    ).toBeNull();
  });
});
