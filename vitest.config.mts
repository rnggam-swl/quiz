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
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
  },
});
