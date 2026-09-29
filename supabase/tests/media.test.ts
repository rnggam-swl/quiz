import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { as, createTestDb, createUser, service, user } from "./db";

// P8-15 · orphan_media: which quiz-media files nothing points at any more.

let db: PGlite;
let host: string;
let quizId: string;
const BASE = "https://proj.supabase.co/storage/v1/object/public/quiz-media";

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

const path = (quiz: string, file: string) => `${host}/${quiz}/${file}`;

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "host@sekolah.id" });
  await db.exec("insert into storage.buckets (id, name, public) values ('lain', 'lain', true)");

  quizId = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Kuis Media') returning id",
      );
      const q1 = crypto.randomUUID();
      // Draft: question media + an option image inside config.
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([
          {
            id: q1,
            type: "multiple_choice",
            prompt: "Hewan apa?",
            media: [{ kind: "image", url: `${BASE}/${host}/${id}/soal.png`, alt: "" }],
            config: {
              multiple: false,
              correctIds: ["a"],
              options: [
                {
                  id: "a",
                  text: "Kucing",
                  media: { kind: "image", url: `${BASE}/${host}/${id}/opsi.webp` },
                },
                { id: "b", text: "Anjing" },
              ],
            },
          },
        ]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'kuis-media-ab1')", [id]);
      // After publishing, the teacher swaps the image: the draft forgets it, v1 still has it.
      await tx.query(
        "update public.questions set media = jsonb_build_array(jsonb_build_object('kind', 'image', 'url', $2::text, 'alt', '')) where id = $1",
        [q1, `${BASE}/${host}/${id}/soal-baru.png`],
      );
      await tx.query("update public.quizzes set cover_url = $2 where id = $1", [
        id,
        `${BASE}/${host}/${id}/cover.jpg`,
      ]);
      return id;
    },
    { commit: true },
  );

  const deletedQuiz = crypto.randomUUID();
  const old = "now() - interval '3 days'";
  await db.exec(`
    insert into storage.objects (bucket_id, name, created_at) values
      ('quiz-media', '${path(quizId, "soal.png")}', ${old}),
      ('quiz-media', '${path(quizId, "soal-baru.png")}', ${old}),
      ('quiz-media', '${path(quizId, "opsi.webp")}', ${old}),
      ('quiz-media', '${path(quizId, "cover.jpg")}', ${old}),
      ('quiz-media', '${path(quizId, "dilepas.png")}', ${old}),
      ('quiz-media', '${path(deletedQuiz, "a.png")}', ${old}),
      ('quiz-media', '${path(quizId, "baru-diunggah.png")}', now()),
      ('lain', '${path(quizId, "bukan-bucket-ini.png")}', ${old});
  `);
}, 60_000);

describe("orphan_media", () => {
  it("finds unreferenced files older than a day, and keeps everything a quiz still uses", async () => {
    const names = await as(db, service, async (tx) =>
      (await tx.query<{ name: string }>("select name from public.orphan_media()")).rows.map((r) =>
        r.name.split("/").slice(1).join("/"),
      ),
    );
    expect(names.toSorted()).toEqual(
      [`${quizId}/dilepas.png`, expect.stringMatching(/\/a\.png$/)].toSorted(),
    );
    expect(names).toHaveLength(2);
  });

  it("respects the age and limit arguments", async () => {
    const count = await as(db, service, async (tx) =>
      Number(
        (
          await one<{ n: number }>(
            tx,
            "select count(*) as n from public.orphan_media(interval '0 seconds', 1000)",
          )
        ).n,
      ),
    );
    expect(count).toBe(3); // + the fresh upload
    const limited = await as(
      db,
      service,
      async (tx) => (await tx.query("select * from public.orphan_media(interval '1 day', 1)")).rows,
    );
    expect(limited).toHaveLength(1);
  });

  it("is only for the server", async () => {
    await expect(
      as(db, user(host), (tx) => tx.query("select * from public.orphan_media()")),
    ).rejects.toThrow(/permission denied/);
  });
});
