import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, user } from "./db";

// P8-11 · Library: public/unlisted quizzes, published version only, copies.

let db: PGlite;
let host: string;
let teacher: string;
const quiz: Record<"pub" | "unlisted" | "priv" | "draft", string> = {
  pub: "",
  unlisted: "",
  priv: "",
  draft: "",
};

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

async function makeQuiz(
  tx: Transaction,
  title: string,
  visibility: string,
  publish: boolean,
): Promise<string> {
  const { id } = await one<{ id: string }>(
    tx,
    "insert into public.quizzes (title, description, visibility) values ($1, 'Untuk kelas 4', $2) returning id",
    [title, visibility],
  );
  await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
    id,
    JSON.stringify([
      {
        id: crypto.randomUUID(),
        type: "true_false",
        prompt: `${title}: paus itu mamalia?`,
        config: { correct: true },
        tags: ["hewan"],
      },
    ]),
  ]);
  if (publish) {
    await tx.query("select * from public.publish_quiz($1, 1, $2)", [
      id,
      `${title.toLowerCase().replaceAll(" ", "-")}-ab1`,
    ]);
  }
  return id;
}

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "host@sekolah.id", name: "Bu Sari" });
  teacher = await createUser(db, { email: "guru@lain.id", name: "Pak Budi" });
  await as(
    db,
    user(host),
    async (tx) => {
      quiz.pub = await makeQuiz(tx, "Hewan Laut", "public", true);
      quiz.unlisted = await makeQuiz(tx, "Hewan Darat", "unlisted", true);
      quiz.priv = await makeQuiz(tx, "Hewan Rahasia", "private", true);
      quiz.draft = await makeQuiz(tx, "Hewan Draf", "public", false);
      // Draft edits after publishing must not leak into the library.
      await tx.query("update public.quizzes set title = 'Judul draf baru' where id = $1", [
        quiz.pub,
      ]);
    },
    { commit: true },
  );
}, 60_000);

const search = (query: string | null) =>
  as(
    db,
    anon,
    async (tx) =>
      (
        await tx.query<{ id: string; title: string; author: string; question_count: number }>(
          "select id, title, author, question_count from public.library_quizzes($1)",
          [query],
        )
      ).rows,
  );

describe("library_quizzes", () => {
  it("lists only published public quizzes, with the published title", async () => {
    expect(await search(null)).toEqual([
      { id: quiz.pub, title: "Hewan Laut", author: "Bu Sari", question_count: 1 },
    ]);
  });

  it("searches title and description, ignoring case", async () => {
    expect(await search("LAUT")).toHaveLength(1);
    expect(await search("kelas 4")).toHaveLength(1);
    expect(await search("darat")).toHaveLength(0); // unlisted
    expect(await search("draf baru")).toHaveLength(0); // draft title
  });
});

describe("library_quiz", () => {
  const preview = (id: string) =>
    as(
      db,
      anon,
      async (tx) =>
        (await one<{ v: Row | null }>(tx, "select public.library_quiz($1) as v", [id])).v,
    );

  it("previews public and unlisted quizzes without answers", async () => {
    const pub = await preview(quiz.pub);
    expect(pub).toMatchObject({ title: "Hewan Laut", author: "Bu Sari", copies: 0 });
    expect(pub!.questions).toEqual([
      { type: "true_false", prompt: "Hewan Laut: paus itu mamalia?", points: 1000, image: null },
    ]);
    expect(JSON.stringify(pub)).not.toContain("correct");
    expect(await preview(quiz.unlisted)).toMatchObject({ visibility: "unlisted" });
  });

  it("hides private and unpublished quizzes", async () => {
    expect(await preview(quiz.priv)).toBeNull();
    expect(await preview(quiz.draft)).toBeNull();
  });
});

describe("copy_library_quiz", () => {
  it("copies the published version into the caller's account as a private draft", async () => {
    await as(db, user(teacher), async (tx) => {
      const { id } = await one<{ id: string }>(tx, "select public.copy_library_quiz($1) as id", [
        quiz.pub,
      ]);
      const copy = await one(
        tx,
        "select owner_id, title, visibility, copied_from, latest_version from public.quizzes where id = $1",
        [id],
      );
      expect(copy).toEqual({
        owner_id: teacher,
        title: "Hewan Laut",
        visibility: "private",
        copied_from: quiz.pub,
        latest_version: null,
      });
      const { rows } = await tx.query<{ prompt: string; config: Row; tags: string[] }>(
        "select prompt, config, tags from public.questions where quiz_id = $1",
        [id],
      );
      expect(rows).toEqual([
        { prompt: "Hewan Laut: paus itu mamalia?", config: { correct: true }, tags: ["hewan"] },
      ]);
      const counted = await one<{ copies: number }>(
        tx,
        "select copies from public.library_quizzes(null) where id = $1",
        [quiz.pub],
      );
      expect(Number(counted.copies)).toBe(1);
    });
  });

  it("copies unlisted quizzes by link, and one's own private quizzes", async () => {
    await as(db, user(teacher), (tx) =>
      tx.query("select public.copy_library_quiz($1)", [quiz.unlisted]),
    );
    await as(db, user(host), (tx) => tx.query("select public.copy_library_quiz($1)", [quiz.priv]));
  });

  it("refuses private, unpublished and anonymous copies", async () => {
    for (const id of [quiz.priv, quiz.draft]) {
      await expect(
        as(db, user(teacher), (tx) => tx.query("select public.copy_library_quiz($1)", [id])),
      ).rejects.toThrow("quiz_not_found");
    }
    await expect(
      as(db, anon, (tx) => tx.query("select public.copy_library_quiz($1)", [quiz.pub])),
    ).rejects.toThrow(/permission denied/);
  });
});
