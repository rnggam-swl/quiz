import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

let db: PGlite;
let host: string;
let otherHost: string;
let student: string;
let versionId: string;
let examId: string;
let q1: string;
let q2: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "guru@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  student = await createUser(db, { email: "siswa@sekolah.id", name: "Siswa Login" });
  q1 = crypto.randomUUID();
  q2 = crypto.randomUUID();

  ({ versionId, examId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Ujian IPA') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          { id: q1, type: "true_false", prompt: "A?", config: { correct: true }, points: 1000 },
          { id: q2, type: "essay", prompt: "Jelaskan.", config: {}, points: 2000 },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'ujian-ipa-ab1')", [id]);
      const version = await one<{ id: string }>(
        tx,
        "select id from public.quiz_versions where quiz_id = $1",
        [id],
      );
      const exam = await one<{ id: string }>(
        tx,
        `insert into public.sessions (quiz_id, quiz_version_id, mode, code, status, title, opens_at, closes_at)
         values ($1, $2, 'exam', public.generate_session_code(), 'running', 'UTS IPA',
                 now() - interval '1 hour', now() + interval '2 hours')
         returning id`,
        [id, version.id],
      );
      await tx.query(
        `insert into public.session_roster (session_id, name, identifier, extra_time_pct) values
           ($1, 'Ani Wijaya', '1001', 0),
           ($1, 'Budi Santoso', 'budi@sekolah.id', 50)`,
        [exam.id],
      );
      return { versionId: version.id, examId: exam.id };
    },
    { commit: true },
  ));
}, 60_000);

const joinExam = (
  tx: Transaction,
  { nickname = "", userId = null, identifier = null }: Partial<Record<string, string | null>> = {},
) =>
  one<{ id: string; nickname: string; roster_id: string | null; user_id: string | null }>(
    tx,
    "select id, nickname, roster_id, user_id from public.join_exam($1, $2, $3, $4)",
    [examId, nickname, userId, identifier],
  );

const start = (tx: Transaction, participantId: string, duration: number | null = 600) =>
  one<{ id: string; deadline: string | null; max_score: string | null; status: string }>(
    tx,
    "select id, deadline, max_score, status from public.start_attempt($1, $2, 7, $3, 1, $4, 3000)",
    [participantId, versionId, [q1, q2], duration],
  );

const secondsUntil = (iso: string | null) => (Date.parse(iso!) - Date.now()) / 1000;

describe("session_roster", () => {
  it("belongs to the exam's host only", async () => {
    await as(db, user(host), async (tx) => {
      const { count } = await one<{ count: number }>(
        tx,
        "select count(*)::int as count from public.session_roster where session_id = $1",
        [examId],
      );
      expect(count).toBe(2);
    });
    await as(db, user(otherHost), async (tx) => {
      const { rows } = await tx.query("select id from public.session_roster");
      expect(rows).toEqual([]);
    });
    await expect(
      as(db, user(otherHost), (tx) =>
        tx.query(
          "insert into public.session_roster (session_id, name, identifier) values ($1, 'X', 'x')",
          [examId],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      as(db, anon, (tx) => tx.query("select * from public.session_roster")),
    ).rejects.toThrow(/permission denied/);
  });

  it("rejects the same identifier twice, ignoring case and spaces", async () => {
    await expect(
      as(db, user(host), (tx) =>
        tx.query(
          "insert into public.session_roster (session_id, name, identifier) values ($1, 'Lagi', ' BUDI@sekolah.id ')",
          [examId],
        ),
      ),
    ).rejects.toThrow(/duplicate key/);
  });
});

describe("join_exam", () => {
  it("admits roster members under their roster name, once", async () => {
    await as(db, service, async (tx) => {
      const first = await joinExam(tx, { identifier: " 1001 ", nickname: "diabaikan" });
      expect(first).toMatchObject({ nickname: "Ani Wijaya" });
      expect(first.roster_id).not.toBeNull();
      const again = await joinExam(tx, { identifier: "1001" });
      expect(again.id).toBe(first.id);
    });
  });

  it("refuses identifiers that aren't on the roster", async () => {
    await expect(as(db, service, (tx) => joinExam(tx, { identifier: "9999" }))).rejects.toThrow(
      "not_on_roster",
    );
  });

  it("returns the same participant for the same account", async () => {
    await as(db, service, async (tx) => {
      const first = await joinExam(tx, { userId: student, nickname: "Siswa Login" });
      const again = await joinExam(tx, { userId: student, nickname: "Nama lain" });
      expect(again.id).toBe(first.id);
      expect(first.user_id).toBe(student);
    });
  });

  it("dedupes open-access nicknames and refuses closed exams", async () => {
    await as(db, service, async (tx) => {
      expect((await joinExam(tx, { nickname: "Citra" })).nickname).toBe("Citra");
      expect((await joinExam(tx, { nickname: "citra" })).nickname).toBe("citra 2");
    });
    await expect(
      as(db, service, async (tx) => {
        await tx.query(
          "update public.sessions set closes_at = now() - interval '1 minute' where id = $1",
          [examId],
        );
        await joinExam(tx, { nickname: "Telat" });
      }),
    ).rejects.toThrow("session_closed");
  });

  it("is not callable by browsers", async () => {
    await expect(as(db, anon, (tx) => joinExam(tx, { nickname: "x" }))).rejects.toThrow(
      /permission denied/,
    );
    await expect(as(db, user(host), (tx) => joinExam(tx, { nickname: "x" }))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("start_attempt (exam)", () => {
  it("sets the deadline from the duration and stores max_score", async () => {
    await as(db, service, async (tx) => {
      const p = await joinExam(tx, { identifier: "1001" });
      const a = await start(tx, p.id, 600);
      expect(secondsUntil(a.deadline)).toBeGreaterThan(590);
      expect(secondsUntil(a.deadline)).toBeLessThan(610);
      expect(Number(a.max_score)).toBe(3000);
    });
  });

  it("adds the roster accommodation", async () => {
    await as(db, service, async (tx) => {
      const p = await joinExam(tx, { identifier: "budi@sekolah.id" });
      const a = await start(tx, p.id, 600);
      expect(secondsUntil(a.deadline)).toBeGreaterThan(890); // 600 s + 50%
      expect(secondsUntil(a.deadline)).toBeLessThan(910);
    });
  });

  it("never runs past closes_at", async () => {
    await as(db, service, async (tx) => {
      await tx.query(
        "update public.sessions set closes_at = now() + interval '5 minutes' where id = $1",
        [examId],
      );
      const p = await joinExam(tx, { nickname: "Dewi" });
      const a = await start(tx, p.id, 3600);
      expect(secondsUntil(a.deadline)).toBeLessThan(301);
    });
  });

  it("refuses to start before opens_at", async () => {
    await expect(
      as(db, service, async (tx) => {
        const p = await joinExam(tx, { nickname: "Eko" });
        await tx.query(
          "update public.sessions set opens_at = now() + interval '1 hour' where id = $1",
          [examId],
        );
        await start(tx, p.id);
      }),
    ).rejects.toThrow("session_closed");
  });
});

describe("deadlines", () => {
  /** An in-progress attempt whose deadline passed `secondsAgo` ago. */
  async function overdue(tx: Transaction, nickname: string, secondsAgo: number) {
    const p = await joinExam(tx, { nickname });
    const a = await start(tx, p.id);
    await tx.query(
      "select * from public.record_response($1, $2, '{\"value\":true}', 1, 1, 1000, 500, true)",
      [a.id, q1],
    );
    await tx.query(
      "update public.attempts set deadline = now() - make_interval(secs => $2) where id = $1",
      [a.id, secondsAgo],
    );
    return a.id;
  }

  it("rejects answers after the deadline plus 5 s of grace", async () => {
    await expect(
      as(db, service, async (tx) => {
        const id = await overdue(tx, "Fina", 10);
        await tx.query(
          "select * from public.record_response($1, $2, '{\"value\":false}', 0, 1, 0, 500, true)",
          [id, q1],
        );
      }),
    ).rejects.toThrow("deadline_passed");
  });

  it("accepts an answer inside the grace period", async () => {
    await as(db, service, async (tx) => {
      const id = await overdue(tx, "Gita", 2);
      const r = await one(
        tx,
        "select points from public.record_response($1, $2, '{\"value\":true}', 1, 1, 1000, 500, true)",
        [id, q1],
      );
      expect(r.points).toBe(1000);
    });
  });

  it("closes a late submission as expired, and submitting again changes nothing", async () => {
    await as(db, service, async (tx) => {
      const id = await overdue(tx, "Hadi", 60);
      const done = await one(
        tx,
        "select status, score from public.submit_attempt($1, null, 0, 0)",
        [id],
      );
      expect(done).toMatchObject({ status: "expired" });
      expect(Number(done.score)).toBe(1000);
      const again = await one(tx, "select status from public.submit_attempt($1, null, 0, 0)", [id]);
      expect(again.status).toBe("expired");
    });
  });

  it("expire_attempts() closes overdue attempts with their saved score", async () => {
    await as(db, service, async (tx) => {
      const late = await overdue(tx, "Indah", 30);
      const onTime = await start(tx, (await joinExam(tx, { nickname: "Joko" })).id);
      const { count } = await one<{ count: number }>(
        tx,
        "select public.expire_attempts() as count",
      );
      expect(count).toBeGreaterThanOrEqual(1);
      const rows = await tx.query<{
        id: string;
        status: string;
        score: string | null;
        max_score: string;
      }>("select id, status, score, max_score from public.attempts where id = any($1)", [
        [late, onTime.id],
      ]);
      const byId = new Map(rows.rows.map((r) => [r.id, r]));
      expect(byId.get(late)).toMatchObject({ status: "expired" });
      expect(Number(byId.get(late)!.score)).toBe(1000);
      expect(Number(byId.get(late)!.max_score)).toBe(3000);
      expect(byId.get(onTime.id)).toMatchObject({ status: "in_progress" });
    });
  });
});

describe("integrity events", () => {
  it("are written by the server and read by the exam's host only", async () => {
    const attemptId = await as(
      db,
      service,
      async (tx) => {
        const p = await joinExam(tx, { nickname: "Kiki" });
        const a = await start(tx, p.id);
        const { count } = await one<{ count: number }>(
          tx,
          "select public.log_integrity_events($1, $2) as count",
          [
            a.id,
            JSON.stringify([
              { kind: "tab_hidden", meta: { durationMs: 4000 } },
              { kind: "paste", at: new Date(Date.now() + 3_600_000).toISOString() },
            ]),
          ],
        );
        expect(count).toBe(2);
        return a.id;
      },
      { commit: true },
    );

    await as(db, user(host), async (tx) => {
      const { rows } = await tx.query<{ kind: string; at: string }>(
        "select kind, at from public.integrity_events where attempt_id = $1 order by id",
        [attemptId],
      );
      expect(rows.map((r) => r.kind)).toEqual(["tab_hidden", "paste"]);
      // A client clock running ahead can't log in the future.
      expect(Date.parse(rows[1]!.at)).toBeLessThanOrEqual(Date.now() + 1000);
    });
    await as(db, user(otherHost), async (tx) => {
      const { rows } = await tx.query("select id from public.integrity_events");
      expect(rows).toEqual([]);
    });
  });

  it("rejects unknown kinds and oversized batches, and browsers can't call it", async () => {
    await expect(
      as(db, service, async (tx) => {
        const a = await start(tx, (await joinExam(tx, { nickname: "Lina" })).id);
        await tx.query("select public.log_integrity_events($1, $2)", [
          a.id,
          JSON.stringify([{ kind: "hacked" }]),
        ]);
      }),
    ).rejects.toThrow(/integrity_events_kind_check/);
    await expect(
      as(db, service, async (tx) => {
        const a = await start(tx, (await joinExam(tx, { nickname: "Mira" })).id);
        await tx.query("select public.log_integrity_events($1, $2)", [
          a.id,
          JSON.stringify(Array.from({ length: 51 }, () => ({ kind: "copy" }))),
        ]);
      }),
    ).rejects.toThrow("invalid_events");
    await expect(
      as(db, user(host), (tx) =>
        tx.query("select public.log_integrity_events($1, '[]')", [crypto.randomUUID()]),
      ),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("host actions", () => {
  async function attemptFor(nickname: string, submit = false) {
    return as(
      db,
      service,
      async (tx) => {
        const a = await start(tx, (await joinExam(tx, { nickname })).id);
        await tx.query(
          'select * from public.record_response($1, $2, \'{"text":"Karena fotosintesis."}\', null, null, 0, 500, true)',
          [a.id, q2],
        );
        if (submit) await tx.query("select public.submit_attempt($1, null, 0, 0)", [a.id]);
        return a.id;
      },
      { commit: true },
    );
  }

  it("extend_attempt adds minutes to a running attempt", async () => {
    const id = await attemptFor("Nana");
    await as(db, user(host), async (tx) => {
      const a = await one<{ deadline: string }>(
        tx,
        "select deadline from public.extend_attempt($1, 10)",
        [id],
      );
      expect(secondsUntil(a.deadline)).toBeGreaterThan(1150); // 600 s + 10 min
    });
    await expect(
      as(db, user(otherHost), (tx) => tx.query("select public.extend_attempt($1, 10)", [id])),
    ).rejects.toThrow("attempt_not_found");
  });

  it("reopen_attempt reopens a finished attempt, reset_attempt removes it", async () => {
    const id = await attemptFor("Oki", true);
    await as(db, user(host), async (tx) => {
      const a = await one(tx, "select status, submitted_at from public.reopen_attempt($1, 15)", [
        id,
      ]);
      expect(a).toMatchObject({ status: "in_progress", submitted_at: null });
      await expect(tx.query("select public.reopen_attempt($1, 15)", [id])).rejects.toThrow(
        "attempt_open",
      );
    });
    await as(db, user(host), async (tx) => {
      await tx.query("select public.reset_attempt($1)", [id]);
      const { rows } = await tx.query("select id from public.attempts where id = $1", [id]);
      expect(rows).toEqual([]);
    });
    await expect(
      as(db, user(otherHost), (tx) => tx.query("select public.reset_attempt($1)", [id])),
    ).rejects.toThrow("attempt_not_found");
  });

  it("grade_response scores an essay from the version's points and updates the total", async () => {
    const id = await attemptFor("Putri", true);
    const responseId = await as(db, user(host), async (tx) => {
      const r = await one<{ id: string; correct: string | null }>(
        tx,
        "select id, correct from public.responses where attempt_id = $1 and question_id = $2",
        [id, q2],
      );
      expect(r.correct).toBeNull(); // waiting for manual grading
      const graded = await one(
        tx,
        "select points, correct, feedback, graded_by from public.grade_response($1, 0.75, ' Bagus ', $2)",
        [r.id, JSON.stringify([{ criterion: "Isi", score: 3, max: 4 }])],
      );
      expect(graded).toMatchObject({ points: 1500, feedback: "Bagus", graded_by: host });
      expect(Number(graded.correct)).toBe(0.75);
      const attempt = await one(tx, "select score from public.attempts where id = $1", [id]);
      expect(Number(attempt.score)).toBe(1500);
      return r.id;
    });
    await expect(
      as(db, user(host), (tx) => tx.query("select public.grade_response($1, 1.5)", [responseId])),
    ).rejects.toThrow("invalid_ratio");
    await expect(
      as(db, user(otherHost), (tx) =>
        tx.query("select public.grade_response($1, 1)", [responseId]),
      ),
    ).rejects.toThrow("response_not_found");
    await expect(
      as(db, anon, (tx) => tx.query("select public.grade_response($1, 1)", [responseId])),
    ).rejects.toThrow(/permission denied/);
  });

  it("end_exam closes the window and cuts running attempts off", async () => {
    const id = await attemptFor("Qori");
    await as(db, user(host), async (tx) => {
      const s = await one(tx, "select status, closes_at from public.end_exam($1)", [examId]);
      expect(s.status).toBe("ended");
      expect(Date.parse(s.closes_at as string)).toBeLessThanOrEqual(Date.now() + 1000);
      const a = await one<{ deadline: string }>(
        tx,
        "select deadline from public.attempts where id = $1",
        [id],
      );
      expect(secondsUntil(a.deadline)).toBeLessThanOrEqual(1);
    });
    await expect(
      as(db, user(otherHost), (tx) => tx.query("select public.end_exam($1)", [examId])),
    ).rejects.toThrow("session_not_found");
  });

  it("lets the host release results on their own exam only", async () => {
    await as(db, user(host), async (tx) => {
      const s = await one(
        tx,
        "update public.sessions set results_released_at = now() where id = $1 returning results_released_at",
        [examId],
      );
      expect(s.results_released_at).not.toBeNull();
    });
    await as(db, user(otherHost), async (tx) => {
      const { rows } = await tx.query(
        "update public.sessions set results_released_at = now() where id = $1 returning id",
        [examId],
      );
      expect(rows).toEqual([]);
    });
  });
});
