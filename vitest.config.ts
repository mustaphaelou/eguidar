import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      // Le marqueur `server-only` lève à l'import : Next l'applique au bundle
      // client, pas vitest. Voir `test/server-only.ts` et la garde de
      // frontière de la Session courante.
      "server-only": path.resolve(import.meta.dirname, "test/server-only.ts"),
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
