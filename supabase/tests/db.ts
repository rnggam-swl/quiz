import { readFileSync } from "node:fs";

import { PGlite, type Transaction } from "@electric-sql/pglite";
import { inject } from "vitest";

import { migratedDb } from "./migrate";

/**
 * Fresh in-memory Postgres with the Supabase shim and every migration applied: a copy of
 * the database global-setup.ts migrated once for the whole run.
 */
export async function createTestDb(): Promise<PGlite> {
  const snapshot = inject("pgliteSnapshot");
  if (!snapshot) return migratedDb();
  return PGlite.create({ loadDataDir: new Blob([readFileSync(snapshot)]) });
}

export type Actor =
  { role: "anon" } | { role: "service_role" } | { role: "authenticated"; userId: string };

/**
 * Run `fn` as a Supabase API caller (RLS applies), inside a transaction that is
 * always rolled back unless `commit` is set — so tests stay independent.
 */
export async function as<T>(
  db: PGlite,
  actor: Actor,
  fn: (tx: Transaction) => Promise<T>,
  { commit = false } = {},
): Promise<T> {
  return db.transaction(async (tx) => {
    const sub = actor.role === "authenticated" ? actor.userId : "";
    await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
    await tx.exec(`set local role ${actor.role}`);
    // If fn throws, PGlite rolls the transaction back itself.
    const result = await fn(tx);
    if (!commit) await tx.rollback();
    return result;
  });
}

/** Create an auth user as the superuser (fires the profile trigger). */
export async function createUser(
  db: PGlite,
  { email, name, anonymous = false }: { email?: string; name?: string; anonymous?: boolean } = {},
): Promise<string> {
  const id = crypto.randomUUID();
  await db.query(
    "insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values ($1, $2, $3, $4)",
    [id, email ?? null, name ? { full_name: name } : {}, anonymous],
  );
  return id;
}

export const user = (userId: string): Actor => ({ role: "authenticated", userId });
export const anon: Actor = { role: "anon" };
/** What Server Actions use (via the secret key) after verifying a participant token. */
export const service: Actor = { role: "service_role" };
