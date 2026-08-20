# TypeScript 7.0.2 — research findings

> Research-only document. Every claim is traced to a primary source (Microsoft's TypeScript blog and GitHub repos, the `typescript` / `@typescript/typescript6` / `@typescript/native-preview` npm package manifests, typescript-eslint docs + GitHub, nextjs.org docs, prisma.io docs + Prisma's GitHub, vitest's GitHub, the `tsx` / `prisma` / `vitest` npm manifests). Retrieval date for all live sources: **20 Aug 2026** (fetched via HTTP GET / webfetch). See [Sources](#sources) for the full URL list. This document is research only — no code, `package.json`, or `tsconfig` was modified.

## Summary

**TypeScript 7.0.2 is the stable release of the native (Go) rewrite of TypeScript** — the "Corsa"/"typescript-go" port announced 11 Mar 2025 as "A 10x Faster TypeScript". It was released on **20 Aug 2026** (tag `v7.0.2`, the current `latest`), originally cut from `microsoft/typescript-go` and mirrored into `microsoft/TypeScript`. It keeps the *same language surface, type-checking results, and CLI behavior* as TS 6.0, but ships a native binary (`tsc`), shared-memory multithreading, an LSP-based language server, and typically **8–12x faster full builds** with lower memory. The big ecosystem break: **TS 7.0 ships no JavaScript compiler API** — the `typescript@7` npm package's main export is just `lib/version.cjs` — so every tool that imports the TS compiler API (typescript-eslint, ts-api-utils, Volar-style embedders, webpack/ts-loader, etc.) **cannot run on TS 7 yet**. Microsoft ships `@typescript/typescript6` (provides `tsc6` + re-exports the TS 6.0 API) explicitly so TS 6 can sit side-by-side for those tools. The line branched from the **JS-based 6.x line** (TS 7 "is made to be compatible with TypeScript 6.0's type-checking and command-line behavior"; the 6.x JS codebase remains maintained).

**The live problem in this repo:** `eslint-config-next@16.2.6` depends on `typescript-eslint@^8.46.0`, and **typescript-eslint does not support TS 7** — its documented + peer-declared TypeScript range is `>=4.8.4 <6.1.0`, and its tracking issue for TS 7 support ([#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940)) is **open and blocked on TS 7 exposing an API**. Importing typescript-eslint under TS 7 hard-crashes at module load (`ts.Extension` etc. are `undefined`; the `typescript@7` exports map has no main). No version of typescript-eslint (latest 8.67.0) supports TS 7, so **there is no "just bump it" fix**. The workaround that keeps ESLint working is the one Microsoft itself documents: alias the `typescript` package for tooling to `@typescript/typescript6` (side-by-side), while TS 7's `tsc` is still available via a second alias. Upgrading Next (even to latest 16.3.1) does **not** change anything — `eslint-config-next`'s `typescript-eslint@^8.46.0` dependency is unchanged.

**Good news for the rest of the stack:** Next.js 16 officially documents TypeScript 7 support for `next build` (uses the project-local native `tsc` CLI); **Prisma 7.9.1 declares an unbounded `typescript >=5.4.0` peer (no `<6.1.0` cap)** and community reports on Prisma's own tracker show the CLI + generated client working under TS 7.0.2; **Vitest 4 and tsx are esbuild-based** (no `typescript` dependency/peer) and are TS-version-agnostic. This repo's `tsconfig.json` (target ES2017, module esnext, moduleResolution bundler, strict, isolatedModules, noEmit) uses none of the TS 6/7 removed flags, so `npx tsc --noEmit` runs cleanly on TS 7 — but the `types`-defaults-to-`[]` and `rootDir`-defaults-to-`./` changes are the two gotchas to check.

---

## 1. What TypeScript 7.0.2 is

### 1.1 The native port ("Corsa" / typescript-go)

- Announced by Anders Hejlsberg on 11 Mar 2025: "A 10x Faster TypeScript" — a **native port of the TypeScript compiler and tools written in Go** ("Corsa" is the codename), promising "editor startup" improvements, "reduce most build times by 10x", and lower memory. The staging repo was `microsoft/typescript-go`, offered under the same license as TypeScript. Source: [devblogs.microsoft.com/typescript/typescript-native-port/](https://devblogs.microsoft.com/typescript/typescript-native-port/).
- The port was "done as faithfully as possible… to keep results consistent and compatible between the two compilers." Source: [devblogs.microsoft.com/typescript/announcing-typescript-7-0/](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

### 1.2 Release facts for 7.0.2

- 7.0.2 is the current `latest` on npm, released **20 Aug 2026** by jakebailey. The GitHub release note links the announcement post and notes the tag "was originally released at: `https://github.com/microsoft/typescript-go/releases/tag/typescript%2Fv7.0.2`". Source: [github.com/microsoft/TypeScript/releases/tag/v7.0.2](https://github.com/microsoft/TypeScript/releases/tag/v7.0.2).
- The npm `typescript@7.0.2` package ships `"bin": {"tsc": "bin/tsc"}`, `"type": "module"`, platform-specific optional binary packages (`@typescript/typescript-darwin-arm64` etc.), and an `exports` map whose main `"."` is `./lib/version.cjs` plus `./unstable/fs`, `./unstable/ast`, `./unstable/sync`, `./unstable/async`, `./unstable/proto`. There is **no `./lib/typescript.js` compiler-API export**. Source: [registry.npmjs.org/typescript/7.0.2](https://registry.npmjs.org/typescript/7.0.2).
- The `typescript-go` repo README now says: "This repo will be permanently archived in September 2026" — the port is complete and development continues in `microsoft/TypeScript`. Source: [github.com/microsoft/typescript-go](https://github.com/microsoft/typescript-go).

### 1.3 Headline changes vs 5.x / 6.x

- **Speed:** the 7.0 announcement's own benchmark table shows full-build speedups of 7.7x–11.9x over TS 6 on large OSS codebases (vscode 11.9x, sentry 8.9x, bluesky 8.7x, playwright 8.7x, tldraw 7.7x), with memory reductions of 6–26%. With `--checkers 8`, vscode hits 16.7x. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- **What is preserved:** "Practically any TypeScript code that compiles cleanly with TypeScript 6.0 (with the `stableTypeOrdering` flag on, and without any `ignoreDeprecations` flag set) should compile identically in TypeScript 7.0." Program creation, parsing/scanner, tsconfig parsing, type resolution, type checking, JSX, emit, watch, and build mode are all marked **"done"** in the typescript-go feature table. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) + [github.com/microsoft/typescript-go](https://github.com/microsoft/typescript-go).
- **What differs:**
  - **No JavaScript compiler API in 7.0** — "TypeScript 7.0 does not ship with an API. We expect TypeScript 7.1 to ship with a new (and different) API." Language service is LSP-based, not the old `ts.server`/plugin architecture. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
  - New parallelization flags `--checkers` (default 4), `--builders`, and `--singleThreaded`; a rebuilt `--watch` based on a Go port of `@parcel/watcher`. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
  - TS 7.0.2 is the first patch on 7.0 (there was a 7.0.1-rc / 7.0.0-dev preview lineage). Source: [microsoft/TypeScript releases](https://github.com/microsoft/TypeScript/releases).

### 1.4 Relationship to TS 6, `@typescript/native-preview`, and `typescript-go`

- The 5.8-era roadmap: "The JS-based codebase will continue development into the 6.x series… When the native codebase has reached sufficient parity… we'll be releasing it as **TypeScript 7.0**." So **TS 7 branched from the 6.x line**; the JS codebase remains maintained in the 6.x line "until TypeScript 7+ reaches sufficient maturity." Source: [typescript-native-port](https://devblogs.microsoft.com/typescript/typescript-native-port/).
- `@typescript/native-preview` was the pre-7.0 preview distribution (npm version `7.0.0-dev.20260707.2`, bin `tsgo`, "Preview CLI and JS API for the native TypeScript compiler port", same `exports` shape as `typescript@7`). The 7.0 announcement says nightly builds now resume under the standard `typescript` package via `npm install -D typescript@next`. Source: [registry.npmjs.org/@typescript/native-preview/latest](https://registry.npmjs.org/@typescript/native-preview/latest) + [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- `@typescript/typescript6@6.0.2` ships `"bin": {"tsc6": "bin/tsc6"}`, `"main": "./lib/typescript.js"`, `"types": "./lib/typescript.d.ts"`, and depends on `@typescript/old: npm:typescript@^6` — i.e. it **re-exports the TS 6.0 compiler API** and provides a `tsc6` executable. Source: [registry.npmjs.org/@typescript/typescript6/latest](https://registry.npmjs.org/@typescript/typescript6/latest).

---

## 2. Migration path 5.x → 7.x

There is no separate "migration guide" page for 5.x→7.x; Microsoft's guidance is **migrate to 6.0 first**, then 7.0. "TypeScript 7.0 adopts 6.0's new defaults, and provides hard errors in the face of any flags and constructs deprecated in TypeScript 6.0… We encourage developers to adopt TypeScript 6.0 to make the transition to TypeScript 7.0 easier." Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).

### 2.1 New defaults adopted from 6.0 (from the 7.0 announcement)

- `strict` is `true` by default.
- `module` defaults to `esnext`.
- `target` defaults to the current stable ECMAScript version immediately preceding `esnext`.
- `noUncheckedSideEffectImports` is `true` by default.
- `libReplacement` is `false` by default.
- `stableTypeOrdering` is `true` by default, **and cannot be turned off**.
- `rootDir` now defaults to `./` — inner source directories must be explicitly set.
- `types` now defaults to `[]` — the old behavior is restored by setting `"types": ["*"]`. (This is the one that commonly bites: global `@types/*` declarations are no longer auto-included.)

### 2.2 Deprecations that became hard errors / no-ops in 7.0

- `target: es5` is no longer supported.
- `downlevelIteration` is no longer supported.
- `moduleResolution: node/node10` no longer supported (use `nodenext` or `bundler`).
- `module: amd, umd, systemjs, none` no longer supported (use `esnext` or `preserve`).
- `baseUrl` no longer supported; `paths` must be relative to the project root.
- `moduleResolution: classic` no longer supported (use `bundler` or `nodenext`).
- `esModuleInterop` / `allowSyntheticDefaultImports` cannot be set to `false`.
- `alwaysStrict` is assumed `true` and can't be set to `false`.
- `module` keyword in namespace declarations is an error.
- `asserts` keyword on imports must use `with` (ECMAScript import-attribute alignment).
- `/// <reference no-default-lib />` no longer respected under `skipDefaultLibCheck`.
- Command-line builds can't take file paths when a `tsconfig.json` is present unless `--ignoreConfig` is passed.

Source for both 2.1 and 2.2: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) (also points to the [TS 6.0 announcement](https://devblogs.microsoft.com/typescript/announcing-typescript-6-0/) for the underlying deprecations).

### 2.3 Behavior changes that could break an existing codebase

- **`--skipLibCheck` interaction (checker):** "In TypeScript 7, conflicting declarations now consistently error in all contributing sites. This means some projects with errors previously fully silenced by `--skipLibCheck` will now correctly see declaration conflict errors in non-`.d.ts` files." Source: [typescript-go CHANGES.md](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md).
- **Template literal type inference:** empty-placeholder template-literal inference now consumes a full Unicode code point instead of one UTF-16 code unit — a breaking change for type-level string utilities that modeled UTF-16 code units (e.g. a `Length` utility); `HeadTail<"😀abc">` now yields `["😀", "abc"]`. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) + [typescript-go CHANGES.md](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md).
- **JavaScript / JSDoc support was deliberately narrowed** to match `.ts` analysis. Notable removals: Closure-style features (Closure function syntax `function(string): void`, `@enum`, `@class`, namepath types, standalone `?` type, postfix `!`), constructor-function expandos (`function C(){...}` + `C.prototype.m = ...` must become classes), `this`-aliasing for `module.exports`/`globalThis`, and several CommonJS `module.exports` patterns. Source: [typescript-go CHANGES.md](https://github.com/microsoft/typescript-go/blob/main/CHANGES.md).
- **`verbatimModuleSyntax` / `erasableSyntaxOnly` / `isolatedModules`:** no primary source shows a default change for these in 6.0/7.0 — the 7.0 announcement's list of default changes (2.1) is the exhaustive set. `isolatedModules` remains off by default; no claim of a change is made here because none of the primary sources state one.

### 2.4 How this repo's `tsconfig.json` maps to TS 7

The repo's tsconfig (target `ES2017`, module `esnext`, moduleResolution `bundler`, jsx `react-jsx`, `strict`, `isolatedModules`, `incremental`, `noEmit`, `plugins: [{name:"next"}]`, `paths` `@/*`) uses **none** of the removed flags from §2.2 (no `es5`, no `downlevelIteration`, no `node`/`node10`/`classic` resolution, no `baseUrl`-based paths, no `amd/umd/systemjs/none`, no `esModuleInterop:false`, no `alwaysStrict:false`). So `npx tsc` under TS 7 should behave identically. Two TS 7 defaults to double-check because the repo does not set them:

- `types` now defaults to `[]` — if the app relies on ambient `@types/*` globals (e.g. `@types/node`) without listing `"types"`, they must be added (or `"types": ["*"]` to restore 5.x behavior). Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- `rootDir` now defaults to `./` — relevant only to projects that emit; this repo uses `noEmit`, so it's a non-issue for `tsc` (Next/Turbopack handles emit). Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- The `plugins: [{name:"next"}]` language-service plugin is a TS compiler-API plugin. **No primary source confirms the `next` plugin works under TS 7's native LSP** — the TS 7 announcement explicitly says embedded-language/plugin workflows (Vue, MDX, Astro, Svelte, Angular) still need TS 6 because TS 7 "does not yet expose a stable programmatic API", and the `next` plugin is API-based. Editor-side behavior under TS 7 should be verified; `next build` type-checking (CLI) is unaffected (see §3.3).

---

## 3. Ecosystem compatibility

### 3.1 typescript-eslint — the live problem in this repo

- **Supported TS range:** `>=4.8.4 <6.1.0` — stated on the official docs page and enforced via peer dependency on `@typescript-eslint/parser`, `typescript-estree`, `typescript-eslint`, `eslint-plugin`, `project-service`, `tsconfig-utils`, etc. Source: [typescript-eslint.io/users/dependency-versions](https://typescript-eslint.io/users/dependency-versions).
- **No TS-7-supporting version exists as of 20 Aug 2026.** The latest release is **v8.67.0** (10 Aug 2026). Since v8.65.0 (20 Jul 2026) the packages **warn when TS 7 is detected** and the parser gained an `onUnsupportedTypeScriptVersion` option to hard-error instead. Source: [github.com/typescript-eslint/typescript-eslint/releases](https://github.com/typescript-eslint/typescript-eslint/releases) (v8.65.0: "add warning when TS 7 is detected" [#12529](https://github.com/typescript-eslint/typescript-eslint/pull/12529); v8.66.0: "website: list `onUnsupportedTypeScriptVersion`").
- **Why it crashes (not just "unsupported"):** TS 7 ships no compiler API. typescript-eslint's packages access top-level TS API members at module load (`ts.Extension`, `ts.TypeFlags`, `ts.SyntaxKind`, `ts.SyntaxKind` sets, etc.), which are `undefined` in TS 7 — and the `typescript@7` package's `exports` map provides no main entry. Result: `npm ci` fails with `ERESOLVE … peer typescript@">=4.8.4 <6.1.0"`, and forcing install crashes with `TypeError: Cannot read properties of undefined (reading 'Cjs')` / `ERR_PACKAGE_PATH_NOT_EXPORTED`. Source: [issue #12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518), [issue #12445](https://github.com/typescript-eslint/typescript-eslint/issues/12445), [PR #12529](https://github.com/typescript-eslint/typescript-eslint/pull/12529).
- **Official tracking:** [issue #10940 "Use TS 7 (tsgo / typescript-go) for type information"](https://github.com/typescript-eslint/typescript-eslint/issues/10940) — open since 2025-03-11, labeled "blocked by external API", 15 blocking sub-issues. TS 7 support requests (#12518, #12720) are closed as duplicates. So: **no primary source indicates an ETA; support requires TS 7's API (targeted for 7.1) or a major refactor.**
- **Workaround (the one Microsoft documents):** alias `typescript` for tooling to the TS 6 API via `npm install -D typescript@npm:@typescript/typescript6`, so typescript-eslint keeps resolving a real TS 6.x API while TS 7's `tsc` is used elsewhere. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) ("Because some tools like typescript-eslint expect to import from `typescript` directly via peer dependencies, we recommend achieving this via npm aliases."). Forcing the peer range with `overrides` would only silence npm — **no primary source suggests it prevents the runtime crash**, and the crash is inherent to TS 7 having no API, so it is **not** recommended as a fix.

### 3.2 eslint-config-next 16.2.6

- `eslint-config-next@16.2.6` declares dependency `"typescript-eslint": "^8.46.0"` (plus `eslint-plugin-react`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`, `eslint-plugin-react-hooks`, `eslint-import-resolver-typescript`, `@next/eslint-plugin-next`). Its own peer deps are `eslint >=9.0.0` and optional `typescript >=3.3.1` — **the `<6.1.0` cap comes from the transitive typescript-eslint peer**, not from eslint-config-next itself. Source: [registry.npmjs.org/eslint-config-next/16.2.6](https://registry.npmjs.org/eslint-config-next/16.2.6).
- **Does a newer Next help?** The latest `eslint-config-next@16.3.1` still depends on `"typescript-eslint": "^8.46.0"` and its own devDependency is `typescript 6.0.2` — unchanged chain, and no TS-7-supporting typescript-eslint exists to resolve into it. So upgrading Next does **not** fix the peer conflict. Source: [registry.npmjs.org/eslint-config-next/latest](https://registry.npmjs.org/eslint-config-next/latest).
- Practical workarounds in this repo: (a) the TS-team side-by-side alias (§4), which keeps `eslint-config-next`'s typescript-eslint satisfied; or (b) pin `typescript` back to `^6` until typescript-eslint lands TS 7 support.

### 3.3 Next.js 16

- **Next.js officially documents TypeScript 7 support.** The TypeScript docs page (v16.3.1, last updated 2026-08-03) has a "Using TypeScript 7" section: "TypeScript 7 does not currently provide the JavaScript compiler API. To use TypeScript 7 during `next build`, install it in your project: `npm install -D typescript@^7`. **Next.js uses the project-local `tsc` CLI by default**, so no additional configuration is required. To use the JavaScript compiler API instead, set `experimental.useTypeScriptCli` to `false`." Source: [nextjs.org/docs/app/api-reference/config/typescript](https://nextjs.org/docs/app/api-reference/config/typescript).
- Next 16's minimum TS requirement is **5.1.0** (no upper bound). Source: [nextjs.org/blog/next-16](https://nextjs.org/blog/next-16) (Version Requirements table). Note the repo is on Next 16.2.6 while the TS 7 docs page is for 16.3.1 — the documented TS 7 mechanism (`useTypeScriptCli` default = project-local `tsc`) is the thing to verify locally with `npm run build` on 16.2.6.

### 3.4 Prisma 7.9.1

- `prisma@7.9.1` declares `"peerDependencies": {"typescript": ">=5.4.0"}` (optional) — **no upper bound**, so TS 7 satisfies Prisma's peer requirement, and the `prisma` CLI has no runtime dependency on the `typescript` package. Source: [registry.npmjs.org/prisma/7.9.1](https://registry.npmjs.org/prisma/7.9.1).
- The Prisma ORM v7 upgrade guide's prerequisites table lists TypeScript **minimum 5.4.0 / recommended 5.9.x** and does not yet mention TS 7 (no "supports TS 7" statement in the docs). Source: [prisma.io/docs/guides/upgrade-prisma-orm/v7](https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7).
- Practical confirmation from Prisma's own tracker (community reports, not official docs): a Prisma 7.9.1 reporter notes code compiled cleanly under `tsc --strict` on both TS 5.x **and 7.0.2** ([#29882](https://github.com/prisma/prisma/issues/29882)), and a Prisma 7.8.0 project's `prisma -v` output lists `TypeScript: 7.0.2` in the environment ([#29744](https://github.com/prisma/prisma/issues/29744)). No open "Prisma breaks under TS 7" report was found. So: no official docs statement yet, but strong first-party-tracker evidence that `prisma generate` + the generated `prisma-client` type-check under TS 7.0.2.

### 3.5 Vitest 4 and tsx

- **Vitest** (latest 4.1.11) has **no `typescript` dependency and no `typescript` peer** — it transforms via Vite (esbuild). It is "powered by Vite". Source: [registry.npmjs.org/vitest/latest](https://registry.npmjs.org/vitest/latest). Vitest's own repo is already testing with TS 7 in its dev toolchain (Renovate dashboard shows `typescript` → `^7.0.2` updates for vitest's own packages/examples), updated 20 Aug 2026. Source: [vitest-dev/vitest issue #957 (Dependency Dashboard)](https://github.com/vitest-dev/vitest/issues/957). Caveat: Vitest's `--typecheck` mode uses the TS compiler API via checker tooling; **no primary source confirms `vitest --typecheck` works on TS 7** — plain `vitest run` is unaffected.
- **tsx** (4.23.12) depends only on `esbuild ~0.28.0`; its description is "Node.js enhanced with esbuild to run TypeScript & ESM files". It strips types with esbuild and never imports the `typescript` package, so it is TS-version-agnostic. Source: [registry.npmjs.org/tsx/latest](https://registry.npmjs.org/tsx/latest).

---

## 4. What needs to change in THIS repo to cleanly adopt TS 7.0.2

This section is recommendations derived from the primary sources above. Nothing in this document modifies the repo.

### 4.1 package.json — the ESLint peer fix (the one hard blocker)

Because typescript-eslint (latest 8.67.0) caps `typescript <6.1.0` and has no TS-7 version yet (§3.1), and `eslint-config-next@16.2.6` pulls typescript-eslint in (§3.2), the only fix that keeps ESLint working is the **side-by-side alias that Microsoft's 7.0 announcement documents** ([announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)):

```jsonc
// package.json
{
  "devDependencies": {
    "typescript": "npm:@typescript/typescript6@^6.0.2",     // TS 6.0 API for typescript-eslint (satisfies >=4.8.4 <6.1.0); ships `tsc6`
    "@typescript/native": "npm:typescript@^7.0.2"           // real TS 7.0.2; ships `tsc`, so `npx tsc` runs TS 7
  }
}
```

- `@typescript/typescript6@6.0.2` re-exports the TS 6.0 API and ships the `tsc6` executable ([registry](https://registry.npmjs.org/@typescript/typescript6/latest)); `typescript@7.0.2` ships the `tsc` executable ([registry](https://registry.npmjs.org/typescript/7.0.2)). Microsoft's announcement shows exactly this pattern (they name the alias `@typescript/native`). Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- After this, `npm ls typescript typescript-eslint` should report no `invalid` peer, `npx tsc` = TS 7, `npx tsc6` = TS 6.
- **Not recommended:** forcing the peer range via `overrides`/`--legacy-peer-deps`. It silences the install error but cannot stop the typescript-eslint module-load crash, because TS 7 exposes no compiler API (issues [#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518), [#12445](https://github.com/typescript-eslint/typescript-eslint/issues/12445)).
- **Alternative if you don't need TS 7's `tsc`:** simply keep `"typescript": "^6"` (or revert to 5.9.x) until typescript-eslint ships TS 7 support — tracked in [#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940).
- Note: upgrading Next to 16.3.x does **not** resolve this (§3.2); `eslint-config-next`'s typescript-eslint dep is unchanged.

### 4.2 tsconfig.json

No removal-flag changes are required (§2.4). Two TS 7 defaults worth reviewing once `tsc` is TS 7:
- Add explicit `"types"` (e.g. `["node", ...]`) if the app relies on ambient `@types/*` globals; or `"types": ["*"]` to restore pre-6.0 behavior. Source: [announcing-typescript-7-0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/).
- `rootDir` is irrelevant here (project uses `noEmit`).
- The `plugins: [{name:"next"}]` editor plugin is API-based — no primary source confirms it under TS 7's native LSP; verify in the editor or keep TS 6 for editor/plugin workflows (§2.4).

### 4.3 ESLint version strategy

- Stay on typescript-eslint 8.x (latest 8.67.0) — it is the supported line; since 8.65 it emits a clear warning/error on TS 7 detection, which is the intended UX. Source: [releases](https://github.com/typescript-eslint/typescript-eslint/releases), [dependency-versions](https://typescript-eslint.io/users/dependency-versions).
- ESLint 9 (repo's version) is within typescript-eslint's supported ESLint range `^8.57.0 || ^9.0.0 || ^10.0.0`. Source: [dependency-versions](https://typescript-eslint.io/users/dependency-versions).

---

## 5. Verification steps for the repo owner

What to run after adopting TS 7 (with the §4.1 alias), and what "green" looks like:

1. **`npm ls typescript typescript-eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin`** — resolves with **no `invalid` / `ERESOLVE`** entries (the `>=4.8.4 <6.1.0` error disappears once `typescript` resolves to `@typescript/typescript6` for that chain).
2. **`npx tsc --version`** → `7.0.2`; **`npx tsc --noEmit`** → exits 0 with no errors (TS 7's native `tsc`; watch for the §2.3 `--skipLibCheck`-related conflict errors or `types`/JSDoc changes).
3. **`npm run build`** (`next build`) — the build log's "Finished TypeScript" step completes (Next uses the project-local `tsc` CLI; docs: [nextjs.org/docs/app/api-reference/config/typescript](https://nextjs.org/docs/app/api-reference/config/typescript)). If Next 16.2.6 falls back to the JS API (`experimental.useTypeScriptCli`), it would fail here — that's the 16.2.6-vs-16.3.1 behavior to confirm.
4. **`npx eslint .`** — runs to completion with **no module-load crash** (`TypeError … reading 'Cjs'` / `ERR_PACKAGE_PATH_NOT_EXPORTED` are the failure signatures to look for, per [#12518](https://github.com/typescript-eslint/typescript-eslint/issues/12518)/[#12445](https://github.com/typescript-eslint/typescript-eslint/issues/12445)); lint rules still work because they consume the TS 6.0 API via the alias.
5. **`npm run test`** (vitest) — tests run normally (esbuild-based transform, no `typescript` dependency; [vitest manifest](https://registry.npmjs.org/vitest/latest)). If the project uses `vitest --typecheck`, verify separately — **no primary source confirms TS 7 works there** (§3.5).
6. **`npx prisma generate` / `npm run db:migrate`** — `prisma` CLI runs fine under TS 7 (peer `>=5.4.0`, no runtime `typescript` dep; §3.4).

Green = steps 1–5 exit 0 / complete without the peer-resolution error or the typescript-eslint crash; the only remaining caveats are the editor `next` plugin (§2.4/§4.2) and `vitest --typecheck` (§3.5), for which no primary source confirms TS 7 support yet.

---

## Sources

All live sources retrieved **20 Aug 2026** via HTTP GET (npm registry JSON / GitHub API) or webfetch (HTML/Markdown).

Microsoft — TypeScript 7.0 / native port (primary):
1. `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/` — TypeScript 7.0 announcement (8 Jul 2026): native port, no API in 7.0, 6.0/7.0 defaults + hard errors, `--checkers/--builders/--singleThreaded`, `--watch`, JS differences, `@typescript/typescript6` side-by-side + npm-alias recipe, `typescript@next` nightlies, embedded-language caveats.
2. `https://devblogs.microsoft.com/typescript/typescript-native-port/` — "A 10x Faster TypeScript" (11 Mar 2025): the Go/Corsa port announcement, versioning roadmap (6.x JS → 7.0 native), FAQ pointer.
3. `https://github.com/microsoft/TypeScript/releases/tag/v7.0.2` — 7.0.2 release (20 Aug 2026, latest), mirrored from typescript-go.
4. `https://github.com/microsoft/TypeScript/releases` — release list (7.0.2, 6.0.3, 6.0.2, 6.0-rc, 6.0-beta, 5.9.x…).
5. `https://github.com/microsoft/typescript-go` — staging repo README (feature table, "repo is closed"/archived Sep 2026, `@typescript/native-preview`, `tsc` after 7.0-RC).
6. `https://github.com/microsoft/typescript-go/blob/main/CHANGES.md` — intentional differences TS 6.0 vs 7.0: JS/JSDoc removals, `--skipLibCheck` conflict-error change, template-literal Unicode change, scanner/parser/checker notes.
7. `https://registry.npmjs.org/typescript/7.0.2` — `typescript@7.0.2` manifest: `bin tsc`, `type: module`, `exports` (`.` → `lib/version.cjs`, `./unstable/*` only), platform binary packages — no compiler-API export.
8. `https://registry.npmjs.org/@typescript/typescript6/latest` — `@typescript/typescript6@6.0.2`: `bin tsc6`, `main ./lib/typescript.js`, re-exports TS 6 API via `@typescript/old: npm:typescript@^6`.
9. `https://registry.npmjs.org/@typescript/native-preview/latest` — preview package (`7.0.0-dev.20260707.2`, `bin tsgo`, same exports shape).

typescript-eslint (primary):
10. `https://typescript-eslint.io/users/dependency-versions` — supported TypeScript range `>=4.8.4 <6.1.0`, "New TypeScript Version" tracking policy, `onUnsupportedTypeScriptVersion` warning/error docs.
11. `https://github.com/typescript-eslint/typescript-eslint/releases` — v8.67.0 (latest, 10 Aug 2026), v8.66.0, v8.65.0 ("add warning when TS 7 is detected", `onUnsupportedTypeScriptVersion`).
12. `https://github.com/typescript-eslint/typescript-eslint/issues/10940` — open tracking issue "Use TS 7 (tsgo) for type information", blocked by external API (15 blocking sub-issues).
13. `https://github.com/typescript-eslint/typescript-eslint/issues/12518` — "TypeScript 7.0.2 Support" (closed duplicate): `ERESOLVE … peer typescript ">=4.8.4 <6.1.0"`, `TypeError … reading 'Cjs'`.
14. `https://github.com/typescript-eslint/typescript-eslint/issues/12445` — `ERR_PACKAGE_PATH_NOT_EXPORTED` with TS 7 RC (no `exports` main).
15. `https://github.com/typescript-eslint/typescript-eslint/issues/12720` — "Add support for Typescript 7" (closed not-planned/duplicate, 18 Aug 2026).
16. `https://github.com/typescript-eslint/typescript-eslint/pull/12529` — "add warning when TS 7 is detected" (merged 18 Jul 2026): rationale = TS-7 top-level API members are undefined at module load.

Next.js (primary):
17. `https://nextjs.org/docs/app/api-reference/config/typescript` — "Using TypeScript 7" section: install `typescript@^7`; project-local `tsc` CLI used by default; `experimental.useTypeScriptCli`. (Docs version 16.3.1, last updated 2026-08-03.)
18. `https://nextjs.org/blog/next-16` — Next 16 announcement: minimum TypeScript 5.1.0.
19. `https://registry.npmjs.org/eslint-config-next/16.2.6` — manifest: `typescript-eslint@^8.46.0`, peers `eslint >=9.0.0` / optional `typescript >=3.3.1`.
20. `https://registry.npmjs.org/eslint-config-next/latest` — 16.3.1 manifest: same `typescript-eslint@^8.46.0`; devDep `typescript 6.0.2`.

Prisma (primary):
21. `https://registry.npmjs.org/prisma/7.9.1` — manifest: optional peer `typescript >=5.4.0` (no upper bound), no runtime `typescript` dependency.
22. `https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7` — Prisma ORM v7 upgrade guide: prerequisites TypeScript ≥5.4.0 / recommended 5.9.x (no TS 7 statement yet).
23. `https://github.com/prisma/prisma/issues/29882` — Prisma 7.9.1 issue: reporter confirms `tsc --strict` compiles cleanly on TS 5.x and 7.0.2.
24. `https://github.com/prisma/prisma/issues/29744` — Prisma 7.8.0 issue: `prisma -v` environment shows `TypeScript: 7.0.2` (CLI runs under TS 7).

Vitest / tsx (primary):
25. `https://registry.npmjs.org/vitest/latest` — vitest 4.1.11 manifest: no `typescript` dependency/peer (Vite/esbuild transform).
26. `https://github.com/vitest-dev/vitest/issues/957` — vitest Dependency Dashboard (updated 20 Aug 2026): renovate branch `renovate/typescript-7.x` — vitest's own dev toolchain upgrading to TS 7.
27. `https://registry.npmjs.org/tsx/latest` — tsx 4.23.12 manifest: only `esbuild ~0.28.0` dependency; esbuild-based type stripping.

Not used / gaps (no primary source found):
- No standalone "TypeScript 5.x → 7.x migration guide" exists; Microsoft's path is 5.x → 6.0 → 7.0 (sources 1–2).
- No primary source confirms: typescript-eslint TS 7 support ETA (blocked, source 12); the Next `plugins:[{name:"next"}]` editor plugin under TS 7's native LSP (sources 1, 17); `vitest --typecheck` under TS 7 (source 25); an official Prisma docs statement that TS 7 is supported (sources 21–22).
