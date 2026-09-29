import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` throws outside the react-server condition; server code is still unit-testable.
      "server-only": fileURLToPath(new URL("./src/test/empty-module.ts", import.meta.url)),
    },
  },
  test: {
    // supabase/tests: migrations + RLS on PGlite (in-memory Postgres, no Docker needed).
    include: ["src/**/*.test.{ts,tsx}", "supabase/tests/**/*.test.ts"],
    // Migrates one PGlite database; each DB test file starts from a copy of it.
    globalSetup: ["./supabase/tests/global-setup.ts"],
    environment: "node",
  },
});
