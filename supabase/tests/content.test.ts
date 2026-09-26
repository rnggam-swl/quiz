import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, user } from "./db";

let db: PGlite;
let alice: string;
let bob: string;

beforeAll(async () => {
  db = await createTestDb();
  alice = await createUser(db, { email: "alice@sekolah.id", name: "Bu Alice" });
  bob = await createUser(db, { email: "bob@sekolah.id" });
}, 60_000);

type Q = { id: string; type: string; prompt: string; config: object; points?: number };
const q = (prompt: string, extra: Partial<Q> = {}): Q => ({
  id: crypto.randomUUID(),
  type: "true_false",
  prompt,
  config: { correct: true },
  ...extra,
});

async function createQuiz(tx: Transaction, title = "Kuis IPA"): Promise<string> {
  const { rows } = await tx.query<{ id: string }>(
    "insert into public.quizzes (title) values ($1) returning id",
    [title],
  );
  return rows[0]!.id;
}

async function save(tx: Transaction, quizId: string, base: number, questions: Q[], title?: string) {
  const { rows } = await tx.query<{ revision: number }>(
    "select public.save_quiz_draft($1, $2, $3, $4) as revision",
    [quizId, base, title === undefined ? {} : { title }, JSON.stringify(questions)],
  );
  return rows[0]!.revision;
}

async function questionPrompts(tx: Transaction, quizId: string) {
  const { rows } = await tx.query<{ prompt: string }>(
    "select prompt from public.questions where quiz_id = $1 order by position",
    [quizId],
  );
  return rows.map((r) => r.prompt);
}

describe("test harness", () => {
  it("really runs as the given role and user, so RLS applies", async () => {
    const who = await as(db, user(alice), async (tx) => {
      const { rows } = await tx.query<{ role: string; uid: string }>(
        "select current_user as role, auth.uid() as uid",
      );
      return rows[0];
    });
    expect(who).toEqual({ role: "authenticated", uid: alice });

    const anonWho = await as(db, anon, async (tx) => {
      const { rows } = await tx.query<{ role: string; uid: string | null }>(
        "select current_user as role, auth.uid() as uid",
      );
      return rows[0];
    });
    expect(anonWho).toEqual({ role: "anon", uid: null });
  });
});

describe("profiles", () => {
  it("are created on sign-up from metadata or the email", async () => {
    const { rows } = await db.query<{ id: string; display_name: string }>(
      "select id, display_name from public.profiles where id in ($1, $2) order by display_name",
      [alice, bob],
    );
    expect(rows.map((r) => r.display_name)).toEqual(["Bu Alice", "bob"]);
  });

  it("are not created for anonymous participants", async () => {
    const guest = await createUser(db, { anonymous: true });
    const { rows } = await db.query("select 1 from public.profiles where id = $1", [guest]);
    expect(rows).toHaveLength(0);
  });

  it("are only visible to their owner", async () => {
    const rows = await as(db, user(alice), async (tx) =>
      (await tx.query<{ id: string }>("select id from public.profiles")).rows.map((r) => r.id),
    );
    expect(rows).toEqual([alice]);
  });
});

describe("quizzes RLS", () => {
  it("owner_id defaults to the caller and the owner can read it back", async () => {
    await as(db, user(alice), async (tx) => {
      const id = await createQuiz(tx);
      const { rows } = await tx.query<{ owner_id: string }>(
        "select owner_id from public.quizzes where id = $1",
        [id],
      );
      expect(rows[0]?.owner_id).toBe(alice);
    });
  });

  it("cannot create a quiz for someone else", async () => {
    await expect(
      as(db, user(bob), (tx) =>
        tx.query("insert into public.quizzes (owner_id, title) values ($1, 'x')", [alice]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("other users and anon cannot see or change it", async () => {
    const quizId = await as(db, user(alice), (tx) => createQuiz(tx, "Rahasia"), { commit: true });

    await as(db, user(bob), async (tx) => {
      expect((await tx.query("select * from public.quizzes where id = $1", [quizId])).rows).toEqual(
        [],
      );
      const upd = await tx.query("update public.quizzes set title = 'hacked' where id = $1", [
        quizId,
      ]);
      expect(upd.affectedRows).toBe(0);
    });
    await expect(as(db, anon, (tx) => tx.query("select * from public.quizzes"))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("save_quiz_draft", () => {
  it("saves meta and questions in order, bumping the revision", async () => {
    await as(db, user(alice), async (tx) => {
      const quizId = await createQuiz(tx);
      const rev = await save(tx, quizId, 0, [q("Satu"), q("Dua"), q("Tiga")], "Kuis Baru");
      expect(rev).toBe(1);
      expect(await questionPrompts(tx, quizId)).toEqual(["Satu", "Dua", "Tiga"]);
      const { rows } = await tx.query<{ title: string }>(
        "select title from public.quizzes where id = $1",
        [quizId],
      );
      expect(rows[0]?.title).toBe("Kuis Baru");
    });
  });

  it("reorders, updates and deletes questions missing from the payload", async () => {
    await as(db, user(alice), async (tx) => {
      const quizId = await createQuiz(tx);
      const [a, b, c] = [q("A"), q("B"), q("C")];
      await save(tx, quizId, 0, [a, b, c]);
      await save(tx, quizId, 1, [{ ...c, prompt: "C!" }, a]);
      expect(await questionPrompts(tx, quizId)).toEqual(["C!", "A"]);
    });
  });

  it("rejects a stale base revision (edited in another tab)", async () => {
    await expect(
      as(db, user(alice), async (tx) => {
        const quizId = await createQuiz(tx);
        await save(tx, quizId, 0, [q("A")]);
        await save(tx, quizId, 0, [q("B")]);
      }),
    ).rejects.toThrow("revision_conflict");
  });

  it("reports someone else's quiz as not found", async () => {
    const quizId = await as(db, user(alice), (tx) => createQuiz(tx), { commit: true });
    await expect(as(db, user(bob), (tx) => save(tx, quizId, 0, [q("x")]))).rejects.toThrow(
      "quiz_not_found",
    );
  });

  it("never moves a question that belongs to another quiz", async () => {
    const victim = q("Milik Alice");
    const aliceQuiz = await as(
      db,
      user(alice),
      async (tx) => {
        const id = await createQuiz(tx);
        await save(tx, id, 0, [victim]);
        return id;
      },
      { commit: true },
    );

    await as(db, user(bob), async (tx) => {
      const bobQuiz = await createQuiz(tx);
      await save(tx, bobQuiz, 0, [{ ...victim, prompt: "dicuri" }]);
      expect(await questionPrompts(tx, bobQuiz)).toEqual([]);
    });
    const { rows } = await db.query<{ prompt: string; quiz_id: string }>(
      "select prompt, quiz_id from public.questions where id = $1",
      [victim.id],
    );
    expect(rows).toEqual([{ prompt: "Milik Alice", quiz_id: aliceQuiz }]);
  });

  it("is not callable by anon", async () => {
    await expect(as(db, anon, (tx) => save(tx, crypto.randomUUID(), 0, []))).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("publish_quiz", () => {
  it("snapshots the saved draft as successive immutable versions", async () => {
    await as(db, user(alice), async (tx) => {
      const quizId = await createQuiz(tx, "Kuis Sejarah");
      await save(tx, quizId, 0, [q("Proklamasi 1945?"), q("Ibu kota?", { points: 500 })]);

      const first = await tx.query<{ version: number; slug: string }>(
        "select * from public.publish_quiz($1, $2, $3)",
        [quizId, 1, "kuis-sejarah-ab12"],
      );
      expect(first.rows[0]).toEqual({ version: 1, slug: "kuis-sejarah-ab12" });

      await save(tx, quizId, 1, [q("Diubah")]);
      const second = await tx.query<{ version: number; slug: string }>(
        "select * from public.publish_quiz($1, $2, $3)",
        [quizId, 2, "ignored-once-set"],
      );
      expect(second.rows[0]).toEqual({ version: 2, slug: "kuis-sejarah-ab12" });

      const { rows } = await tx.query<{ version: number; snapshot: { questions: Q[] } }>(
        "select version, snapshot from public.quiz_versions where quiz_id = $1 order by version",
        [quizId],
      );
      expect(rows[0]!.snapshot.questions.map((x) => x.prompt)).toEqual([
        "Proklamasi 1945?",
        "Ibu kota?",
      ]);
      expect(rows[0]!.snapshot.questions[1]!.points).toBe(500);
      expect(rows[1]!.snapshot.questions.map((x) => x.prompt)).toEqual(["Diubah"]);

      const quiz = await tx.query<{ latest_version: number; published_revision: number }>(
        "select latest_version, published_revision from public.quizzes where id = $1",
        [quizId],
      );
      expect(quiz.rows[0]).toEqual({ latest_version: 2, published_revision: 2 });
    });
  });

  it("refuses to publish a revision other than the one validated", async () => {
    await expect(
      as(db, user(alice), async (tx) => {
        const quizId = await createQuiz(tx);
        await save(tx, quizId, 0, [q("A")]);
        await tx.query("select * from public.publish_quiz($1, $2, $3)", [quizId, 0, "x-1"]);
      }),
    ).rejects.toThrow("revision_conflict");
  });

  it("versions can't be edited, and are hidden from other users", async () => {
    const quizId = await as(
      db,
      user(alice),
      async (tx) => {
        const id = await createQuiz(tx);
        await save(tx, id, 0, [q("A")]);
        await tx.query("select * from public.publish_quiz($1, 1, 'kuis-a1')", [id]);
        return id;
      },
      { commit: true },
    );

    await expect(
      as(db, user(alice), (tx) =>
        tx.query("update public.quiz_versions set snapshot = '{}' where quiz_id = $1", [quizId]),
      ),
    ).rejects.toThrow(/permission denied/);

    const seenByBob = await as(
      db,
      user(bob),
      async (tx) =>
        (await tx.query("select * from public.quiz_versions where quiz_id = $1", [quizId])).rows,
    );
    expect(seenByBob).toEqual([]);
  });
});

describe("quiz-media storage", () => {
  const upload = (path: string) => (tx: Transaction) =>
    tx.query("insert into storage.objects (bucket_id, name) values ('quiz-media', $1)", [path]);

  it("lets users upload under their own folder only", async () => {
    await as(db, user(alice), upload(`${alice}/quiz-1/cover.png`));
    await expect(as(db, user(bob), upload(`${alice}/quiz-1/evil.png`))).rejects.toThrow(
      /row-level security/,
    );
  });

  it("is a public bucket with a size and type allowlist", async () => {
    const { rows } = await db.query<{
      public: boolean;
      file_size_limit: number;
      allowed: string[];
    }>(
      "select public, file_size_limit, allowed_mime_types as allowed from storage.buckets where id = 'quiz-media'",
    );
    expect(rows[0]).toMatchObject({ public: true, file_size_limit: 10485760 });
    expect(rows[0]!.allowed).toContain("image/png");
  });
});
