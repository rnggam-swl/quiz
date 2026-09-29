import type { PGlite, Transaction } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, service, user } from "./db";

// P8-06 · Webhook outbox: enqueue on submit, claim/finish with backoff, host actions.

let db: PGlite;
let host: string;
let otherHost: string;
let quizId: string;
let versionId: string;
let sessionId: string;
let webhookId: string;
let q1: string;

type Row = Record<string, unknown>;
const one = async <T = Row>(tx: Transaction, sql: string, params: unknown[] = []) =>
  (await tx.query<T>(sql, params)).rows[0]!;

const SECRET = `whsec_${Buffer.alloc(32, 7).toString("base64")}`;

beforeAll(async () => {
  db = await createTestDb();
  host = await createUser(db, { email: "host@sekolah.id" });
  otherHost = await createUser(db, { email: "lain@sekolah.id" });
  q1 = crypto.randomUUID();

  ({ quizId, versionId, sessionId, webhookId } = await as(
    db,
    user(host),
    async (tx) => {
      const { id } = await one<{ id: string }>(
        tx,
        "insert into public.quizzes (title) values ('Kuis Webhook') returning id",
      );
      await tx.query("select public.save_quiz_draft($1, 0, '{}', $2)", [
        id,
        JSON.stringify([{ id: q1, type: "true_false", prompt: "A?", config: { correct: true } }]),
      ]);
      await tx.query("select * from public.publish_quiz($1, 1, 'kuis-webhook-ab1')", [id]);
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
      const webhook = await one<{ id: string }>(
        tx,
        "insert into public.webhooks (url, secret) values ('https://lms.sekolah.id/hook', $1) returning id",
        [SECRET],
      );
      return { quizId: id, versionId: version.id, sessionId: session.id, webhookId: webhook.id };
    },
    { commit: true },
  ));
}, 60_000);

/** A participant starts and submits one attempt; returns its id. */
async function finishAttempt(tx: Transaction, nickname: string): Promise<string> {
  const p = await one<{ id: string }>(tx, "select id from public.join_session($1, $2, $3)", [
    sessionId,
    nickname,
    "lms-42",
  ]);
  const a = await one<{ id: string }>(
    tx,
    "select id from public.start_attempt($1, $2, 1, $3, 0, null)",
    [p.id, versionId, [q1]],
  );
  await tx.query("select * from public.record_response($1, $2, $3, 1, 1, 1000, 800, false)", [
    a.id,
    q1,
    { value: true },
  ]);
  await tx.query("select * from public.submit_attempt($1, 1000, 1, 1)", [a.id]);
  return a.id;
}

const deliveries = (tx: Transaction) =>
  tx
    .query<{
      id: string;
      event: string;
      status: string;
      attempts: number;
      payload: Row;
    }>(
      "select id, event, status, attempts, payload from public.webhook_deliveries order by created_at",
    )
    .then((r) => r.rows);

describe("webhooks table", () => {
  it("is private to its owner", async () => {
    await as(db, user(otherHost), async (tx) => {
      expect((await tx.query("select 1 from public.webhooks")).rows).toHaveLength(0);
    });
    await expect(as(db, anon, (tx) => tx.query("select 1 from public.webhooks"))).rejects.toThrow(
      /permission denied/,
    );
  });

  it("rejects bad URLs, secrets and unknown events", async () => {
    for (const [url, secret, events] of [
      ["ftp://x.id", SECRET, "{attempt.submitted}"],
      ["https://x.id", "rahasia", "{attempt.submitted}"],
      ["https://x.id", SECRET, "{attempt.deleted}"],
      ["https://x.id", SECRET, "{}"],
    ]) {
      await expect(
        as(db, user(host), (tx) =>
          tx.query("insert into public.webhooks (url, secret, events) values ($1, $2, $3)", [
            url,
            secret,
            events,
          ]),
        ),
      ).rejects.toThrow(/check constraint/);
    }
  });
});

describe("attempt.submitted", () => {
  it("queues one delivery per active webhook when an attempt is submitted", async () => {
    await as(db, service, async (tx) => {
      const attemptId = await finishAttempt(tx, "Siswa 1");
      const rows = await deliveries(tx);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ event: "attempt.submitted", status: "pending", attempts: 0 });
      const payload = rows[0]!.payload as {
        id: string;
        type: string;
        data: Record<string, Row>;
      };
      expect(payload.type).toBe("attempt.submitted");
      expect(payload.data.attempt).toMatchObject({
        id: attemptId,
        status: "submitted",
        score: 1000,
        ratio: 1,
      });
      expect(payload.data.participant).toMatchObject({
        nickname: "Siswa 1",
        external_id: "lms-42",
      });
      expect(payload.data.quiz).toMatchObject({ id: quizId, slug: "kuis-webhook-ab1", version: 1 });
      expect(JSON.stringify(payload)).not.toContain("answer");

      // Submitting again changes nothing (already submitted).
      await tx.query("select * from public.submit_attempt($1, 1000, 1, 1)", [attemptId]);
      expect(await deliveries(tx)).toHaveLength(1);
    });
  });

  it("skips paused webhooks and quizzes of owners without webhooks", async () => {
    await as(db, service, async (tx) => {
      // The host pauses the webhook (service_role can't change webhooks itself).
      await tx.exec("reset role");
      await tx.query("update public.webhooks set active = false");
      await tx.exec("set local role service_role");
      await finishAttempt(tx, "Siswa 2");
      expect(await deliveries(tx)).toHaveLength(0);
    });
  });
});

describe("sending", () => {
  const claim = (tx: Transaction) =>
    tx
      .query<{ id: string; attempts: number; url: string; secret: string }>(
        "select id, attempts, url, secret from public.claim_webhook_deliveries(10)",
      )
      .then((r) => r.rows);

  it("claims due deliveries once, then backs off on failure and stops after 7 tries", async () => {
    await as(db, service, async (tx) => {
      await finishAttempt(tx, "Siswa 3");
      const [claimed] = await claim(tx);
      expect(claimed).toMatchObject({
        attempts: 1,
        url: "https://lms.sekolah.id/hook",
        secret: SECRET,
      });
      expect(await claim(tx)).toEqual([]); // locked

      await tx.query("select public.finish_webhook_delivery($1, false, 500, 'oops', null)", [
        claimed!.id,
      ]);
      const retry = await one<{ status: string; wait: number; body: string }>(
        tx,
        `select status, extract(epoch from next_attempt_at - now())::int as wait,
                response_body as body
           from public.webhook_deliveries where id = $1`,
        [claimed!.id],
      );
      expect(retry).toEqual({ status: "pending", wait: 60, body: "oops" });

      await tx.query("update public.webhook_deliveries set attempts = 7 where id = $1", [
        claimed!.id,
      ]);
      await tx.query("select public.finish_webhook_delivery($1, false, null, null, 'timeout')", [
        claimed!.id,
      ]);
      expect((await deliveries(tx))[0]).toMatchObject({ status: "failed" });
    });
  });

  it("marks a delivery succeeded", async () => {
    await as(db, service, async (tx) => {
      await finishAttempt(tx, "Siswa 4");
      const [claimed] = await claim(tx);
      await tx.query("select public.finish_webhook_delivery($1, true, 204, '', null)", [
        claimed!.id,
      ]);
      expect((await deliveries(tx))[0]).toMatchObject({ status: "succeeded", attempts: 1 });
    });
  });

  it("is only for the server", async () => {
    await expect(
      as(db, user(host), (tx) => tx.query("select * from public.claim_webhook_deliveries(1)")),
    ).rejects.toThrow(/permission denied/);
  });
});

describe("host actions", () => {
  it("sends a test event and redelivers, only for the owner", async () => {
    await as(db, user(host), async (tx) => {
      await tx.query("select public.send_test_webhook($1)", [webhookId]);
      const [test] = await deliveries(tx);
      expect(test).toMatchObject({ event: "webhook.test", status: "pending" });
      await tx.query("select public.redeliver_webhook($1)", [test!.id]);
    });
    await expect(
      as(db, user(otherHost), (tx) => tx.query("select public.send_test_webhook($1)", [webhookId])),
    ).rejects.toThrow("webhook_not_found");
  });

  it("lets owners read their deliveries, nobody else", async () => {
    await as(db, user(host), (tx) => tx.query("select public.send_test_webhook($1)", [webhookId]), {
      commit: true,
    });
    await as(db, user(host), async (tx) => {
      expect(await deliveries(tx)).toHaveLength(1);
    });
    const id = (await as(db, service, deliveries))[0]!.id;
    await as(db, user(otherHost), async (tx) => {
      expect(await deliveries(tx)).toHaveLength(0);
    });
    await expect(
      as(db, user(otherHost), (tx) => tx.query("select public.redeliver_webhook($1)", [id])),
    ).rejects.toThrow("delivery_not_found");
  });
});
