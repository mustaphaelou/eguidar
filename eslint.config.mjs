import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  // The vendored `braces` copy is upstream CommonJS: `require()` is the only
  // loading form it has, and the rule that forbids it is aimed at this
  // repository's own code. The directory stays linted — `.gitignore` does not
  // ignore it, and `eslint-ignores.test.ts` requires the linter to see
  // everything git tracks — so only the rule that cannot apply is turned off.
  {
    files: ["vendor/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Implementer worktrees nested in this checkout (git-ignored).
    ".worktrees/**",
    // Directories git ignores and eslint-config-next does not know about. ESLint
    // never reads `.gitignore`, so each one is spelled out: a guard that holds by
    // accident is not a guard. `eslint-ignores.test.ts` derives the correspondence
    // from `.gitignore` and fails when a directory joins one file and not the other.
    // Security audit output and agent scratch (git-ignored).
    ".scratch/**",
    // Coverage reports (git-ignored).
    "coverage/**",
    // Agent notes (git-ignored).
    "notes/**",
  ]),
]);

export default eslintConfig;
