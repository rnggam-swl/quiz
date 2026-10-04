import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

import { anon, as, createTestDb, createUser, user } from "./db";

// P8-16 · account_has_password: only about the caller, and only for signed-in hosts.
describe("account_has_password", () => {
  let db: PGlite;
  let withPassword: string;
  let googleOnly: string;

  beforeAll(async () => {
    db = await createTestDb();
    withPassword = await createUser(db, { email: "guru@sekolah.id", name: "Guru" });
    googleOnly = await createUser(db, { email: "google@sekolah.id", name: "Google" });
    await db.query("update auth.users set encrypted_password = '$2a$10$hash' where id = $1", [
      withPassword,
    ]);
    await db.query("update auth.users set encrypted_password = '' where id = $1", [googleOnly]);
  }, 60_000);

  const hasPassword = (actor: Parameters<typeof as>[1]) =>
    as(db, actor, async (tx) => {
      const { rows } = await tx.query<{ has: boolean }>(
        "select public.account_has_password() as has",
      );
      return rows[0]?.has;
    });

  it("says whether the caller has a password", async () => {
    expect(await hasPassword(user(withPassword))).toBe(true);
    expect(await hasPassword(user(googleOnly))).toBe(false);
  });

  it("is not callable without an account", async () => {
    await expect(hasPassword(anon)).rejects.toThrow(/permission denied/);
  });
});
