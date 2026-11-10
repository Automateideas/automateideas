import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Database tests (pnpm test:db): need Postgres running (docker compose up -d)
// and migrations applied. They create their own throwaway organizations and
// remove them afterwards; they never touch other rows.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // Next.js marker package; it throws when imported outside the server runtime.
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["dotenv/config"],
    fileParallelism: false,
    testTimeout: 30_000,
  },
});
