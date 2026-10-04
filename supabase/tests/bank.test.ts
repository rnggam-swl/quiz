import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, user } from "./db";

// P8-12 · Question bank: tags across one host's quizzes, never another host's.

let db: PGlite;
let host: string;
let otherHost: string;

async function quizWithTags(tx: Transaction, title: string, tagSets: string[][]) {
  const { rows } = await tx.query<{ id: string }>(
    "insert into public.quizzes (title) values ($1) returning id",
    [title],
  );
  await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
    rows[0]!.id,
    JSON.stringify(
      tagSets.map((tags, i) => ({
        id: crypto.randomUUID(),
        type: "true_false",
        prompt: `${title} ${i}`,
        config: { correct: true },
        tags,
      })),
    ),
  ]);
}

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "host@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  await as(
    db,
    user(host),
    async (tx) => {
      await quizWithTags(tx, "IPA", [["hewan", "kelas-4"], ["hewan"], []]);
      await quizWithTags(tx, "IPS", [["peta", "kelas-4"]]);
    },
    { commit: true },
  );
  await as(db, user(otherHost), (tx) => quizWithTags(tx, "Lain", [["rahasia"]]), {
    commit: true,
  });
}, 60_000);

const tags = (actor: Parameters<typeof as>[1]) =>
  as(db, actor, async (tx) =>
    (
      await tx.query<{ tag: string; uses: number }>("select * from public.my_question_tags()")
    ).rows.map((r) => [r.tag, Number(r.uses)]),
  );

describe("my_question_tags", () => {
  it("counts the caller's tags across all their quizzes, most used first", async () => {
    expect(await tags(user(host))).toEqual([
      ["hewan", 2],
      ["kelas-4", 2],
      ["peta", 1],
    ]);
    expect(await tags(user(otherHost))).toEqual([["rahasia", 1]]);
  });

  it("is only for signed-in hosts", async () => {
    await expect(tags(anon)).rejects.toThrow(/permission denied/);
  });

  it("lets the tag filter find questions across quizzes (RLS keeps others out)", async () => {
    const found = await as(db, user(host), async (tx) =>
      (
        await tx.query<{ prompt: string }>(
          "select prompt from public.questions where tags @> $1 order by prompt",
          [["kelas-4"]],
        )
      ).rows.map((r) => r.prompt),
    );
    expect(found).toEqual(["IPA 0", "IPS 0"]);
  });
});
