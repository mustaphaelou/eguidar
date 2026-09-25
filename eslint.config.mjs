import { plugin as shadcn } from "@shadcn/lint";
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    plugins: { shadcn },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    rules: {
      "shadcn/no-restyle": [
        "warn",
        {
          allow: ["layout"],
          contracts: [
            { pattern: "^CardTitle$", allow: ["layout", "typography"] },
            { pattern: "^CardContent$", allow: ["layout", "spacing"] },
            { pattern: "^TableCell$", allow: ["layout", "typography", "color"] },
            { pattern: "^FieldLabel$", allow: ["layout", "typography"] },
            { pattern: "^Label$", allow: ["layout", "typography"] },
          ],
        },
      ],
      "shadcn/no-arbitrary-values": "warn",
      "shadcn/no-unknown-classes": "warn",
    },
  },
  {
    // The design system defines its own styling, including its own arbitrary values.
    files: ["components/ui/**"],
    rules: {
      "shadcn/no-restyle": "off",
      "shadcn/no-arbitrary-values": "off",
      "shadcn/no-unknown-classes": "off",
    },
  },
  {
    // The blog uses a deliberate editorial type scale outside the theme tokens.
    files: ["app/(boutique)/blog/**"],
    rules: {
      "shadcn/no-arbitrary-values": "off",
    },
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
  ]),
]);

export default eslintConfig;
