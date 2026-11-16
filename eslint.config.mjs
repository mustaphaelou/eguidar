import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const DIRECTIVES_LUES =
  /^\s*(?:@vitest-environment\b|@ts-(?:expect-error|ignore|nocheck)\b|eslint-(?:disable|enable)\b|prettier-ignore\b|@vite-ignore\b|@__PURE__\b)/;

const sansCommentaires = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      prose:
        "Commentaire interdit : le code de première partie ne garde que les directives que l'outillage lit. Le nom, la forme, un test, un ADR ou le GLOSSAIRE portent la raison.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const commentaire of context.sourceCode.getAllComments()) {
          if (commentaire.type === "Shebang") continue;
          if (DIRECTIVES_LUES.test(commentaire.value)) continue;
          context.report({ loc: commentaire.loc, messageId: "prose" });
        }
      },
    };
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    ignores: ["vendor/**", "lib/generated/**", "next-env.d.ts"],
    plugins: {
      eguidar: { rules: { "sans-commentaires": sansCommentaires } },
    },
    rules: { "eguidar/sans-commentaires": "error" },
  },
  {
    files: ["vendor/**/*.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".worktrees/**",
    ".agents/**",
    ".scratch/**",
    ".e2e/**",
    "playwright-report/**",
    "test-results/**",
    "coverage/**",
    "notes/**",
  ]),
]);

export default eslintConfig;
