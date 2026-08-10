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
    include: ["**/*.test.{ts,tsx}"],
    setupFiles: ["test/setup.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
})
