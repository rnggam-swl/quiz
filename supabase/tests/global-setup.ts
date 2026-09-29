import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TestProject } from "vitest/node";

import { migratedDb } from "./migrate";

// Apply the migrations once per run and hand every DB test file a copy of the result
// (createTestDb in db.ts). Migrating in each file, in parallel, took minutes and timed out.

declare module "vitest" {
  export interface ProvidedContext {
    pgliteSnapshot: string;
  }
}

export default async function setup(project: TestProject) {
  const db = await migratedDb();
  const dump = await db.dumpDataDir("none");
  await db.close();
  const dir = mkdtempSync(join(tmpdir(), "quiz-pglite-"));
  const file = join(dir, "migrated.tar");
  writeFileSync(file, Buffer.from(await dump.arrayBuffer()));
  project.provide("pgliteSnapshot", file);
  return () => rmSync(dir, { recursive: true, force: true });
}
