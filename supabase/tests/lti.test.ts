import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

// P8-08 · LTI 1.3: platforms per teacher, service-only launch state, the LMS practice session.

let db: PGlite;
let host: string;
let other: string;
let published: string;
let draft: string;
let platform: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

const PLATFORM = {
  name: "Moodle SMA 1",
  issuer: "https://lms.sekolah.id",
  client_id: "abc123",
  auth_login_url: "https://lms.sekolah.id/mod/lti/auth.php",
  auth_token_url: "https://lms.sekolah.id/mod/lti/token.php",
  jwks_url: "https://lms.sekolah.id/mod/lti/certs.php",
};

const addPlatform = (tx: Transaction, overrides: Partial<typeof PLATFORM> = {}) => {
  const p = { ...PLATFORM, ...overrides };
  return one<{ id: string }>(
    tx,
    `insert into public.lti_platforms (name, issuer, client_id, auth_login_url, auth_token_url, jwks_url)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [p.name, p.issuer, p.client_id, p.auth_login_url, p.auth_token_url, p.jwks_url],
  );
};

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "guru@sekolah.id", name: "Bu Sari" });
  other = await createUser(db, { email: "lain@sekolah.id", name: "Pak Budi" });
  await as(
    db,
    user(host),
    async (tx) => {
      for (const title of ["Hewan", "Draf"]) {
        const { id } = await one<{ id: string }>(
          tx,
          "insert into public.quizzes (title) values ($1) returning id",
          [title],
        );
        await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
          id,
          JSON.stringify([
            {
              id: crypto.randomUUID(),
              type: "true_false",
              prompt: "Paus itu mamalia?",
              config: { correct: true },
            },
          ]),
        ]);
        if (title === "Hewan") {
          await tx.query("select * from public.publish_quiz($1, 1, 'hewan-ab1')", [id]);
          published = id;
        } else {
          draft = id;
        }
      }
      platform = (await addPlatform(tx)).id;
    },
    { commit: true },
  );
}, 60_000);

describe("lti_platforms", () => {
  it("belong to the teacher who added them", async () => {
    const own = await as(db, user(host), (tx) =>
      tx.query("select owner_id from public.lti_platforms"),
    );
    expect(own.rows).toEqual([{ owner_id: host }]);
    const others = await as(db, user(other), (tx) =>
      tx.query("select id from public.lti_platforms"),
    );
    expect(others.rows).toEqual([]);
    await expect(
      as(db, anon, (tx) => tx.query("select id from public.lti_platforms")),
    ).rejects.toThrow(/permission denied/);
  });

  it("can't be added for someone else, twice, or over http", async () => {
    await expect(
      as(db, user(other), (tx) =>
        tx.query(
          `insert into public.lti_platforms (owner_id, name, issuer, client_id, auth_login_url, auth_token_url, jwks_url)
           values ($1, 'x', 'https://a.id', 'c', 'https://a.id/a', 'https://a.id/t', 'https://a.id/k')`,
          [host],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(as(db, user(other), (tx) => addPlatform(tx))).rejects.toThrow(/duplicate key/);
    await expect(
      as(db, user(other), (tx) => addPlatform(tx, { client_id: "z", jwks_url: "http://a.id/k" })),
    ).rejects.toThrow(/check constraint/);
  });

  it("can't be changed, only removed by their owner", async () => {
    await expect(
      as(db, user(host), (tx) =>
        tx.query("update public.lti_platforms set jwks_url = 'https://evil.id/k'"),
      ),
    ).rejects.toThrow(/permission denied/);
    const removed = await as(db, user(other), (tx) =>
      tx.query("delete from public.lti_platforms where id = $1", [platform]),
    );
    expect(removed.affectedRows).toBe(0);
  });
});

describe("service-only tables", () => {
  it.each(["lti_keys", "lti_states", "lti_launches"])("%s is closed to users", async (table) => {
    await expect(
      as(db, user(host), (tx) => tx.query(`select * from public.${table}`)),
    ).rejects.toThrow(/permission denied/);
    await expect(as(db, anon, (tx) => tx.query(`select * from public.${table}`))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("keeps a launch and drops it with its platform", async () => {
    await as(db, service, async (tx) => {
      await tx.query(
        `insert into public.lti_launches (platform_id, deployment_id, message_type, lti_user_id, external_id, quiz_id, lineitem)
         values ($1, '1', 'LtiResourceLinkRequest', 'u-42', 'lti:x:u-42', $2, 'https://lms.sekolah.id/li/9')`,
        [platform, published],
      );
      await tx.query(
        "insert into public.lti_states (state, nonce, platform_id) values ('s', 'n', $1)",
        [platform],
      );
      await expect(
        tx.query(
          `insert into public.lti_launches (platform_id, deployment_id, message_type, lti_user_id, external_id)
           values ($1, '1', 'LtiSubmissionReviewRequest', 'u', 'e')`,
          [platform],
        ),
      ).rejects.toThrow(/check constraint/);
    });
  });
});

describe("lti_practice_session", () => {
  it("makes the quiz's practice session with its owner as host, once", async () => {
    const [first, again] = await as(db, service, async (tx) => [
      await one<{ id: string; host_id: string; mode: string; is_default: boolean }>(
        tx,
        "select id, host_id, mode, is_default from public.lti_practice_session($1)",
        [published],
      ),
      await one<{ id: string }>(tx, "select id from public.lti_practice_session($1)", [published]),
    ]);
    expect(first).toMatchObject({ host_id: host, mode: "practice", is_default: true });
    expect(again.id).toBe(first.id);
  });

  it("refuses drafts and isn't for users", async () => {
    await expect(
      as(db, service, (tx) => tx.query("select public.lti_practice_session($1)", [draft])),
    ).rejects.toThrow(/not_published/);
    await expect(
      as(db, user(host), (tx) => tx.query("select public.lti_practice_session($1)", [published])),
    ).rejects.toThrow(/permission denied/);
  });
});
