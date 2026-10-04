import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";

const SUPABASE_DIR = join(import.meta.dirname, "..");

/** In-memory Postgres with the Supabase shim and every migration applied, in order. */
export async function migratedDb(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(readFileSync(join(SUPABASE_DIR, "tests", "supabase-shim.sql"), "utf8"));
  const migrationsDir = join(SUPABASE_DIR, "migrations");
  for (const file of readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    try {
      await db.exec(readFileSync(join(migrationsDir, file), "utf8"));
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`, { cause: error });
    }
  }
  return db;
}
