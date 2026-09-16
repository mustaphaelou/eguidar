import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["**/*.test.{ts,tsx}"],
    // Implementer worktrees nested in this checkout hold their own full copy of the suite.
    exclude: ["**/node_modules/**", "**/.git/**", ".worktrees/**"],
    setupFiles: ["test/setup.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
})
