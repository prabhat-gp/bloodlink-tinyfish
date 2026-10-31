import { defineConfig } from "vitest/config";

// *.e2e.ts only runs here (it needs grammy from bot/node_modules); the root `npm test` skips it.
export default defineConfig({
  test: { include: ["test/**/*.test.ts", "test/**/*.e2e.ts"] },
});
