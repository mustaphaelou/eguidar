# Does the latest ESLint support TypeScript 7?

> Research-only document. Every claim is traced to a primary source (npm registry JSON, GitHub API for issues/PRs/releases, Microsoft devblogs, the `typescript` / `typescript-eslint` package tarballs themselves, and first-party config files in real repositories).
> **Retrieval date for all live sources: 4 Oct 2026.** Everything below is a snapshot — re-verify before acting on it.
> Companion document: [`docs/research/typescript-7.md`](./typescript-7.md) (dated 20 Aug 2026), which covers the TS 7 migration itself. This document answers only the ESLint question, and corrects two stale claims in that companion doc (§8).
> This document is research only — no code, `package.json`, or `tsconfig` was modified.

---

## TL;DR

**No. Nothing in the ESLint ecosystem supports TypeScript 7 as a lint target today, and the blocker is not ESLint itself — it is `typescript-eslint`.**

| Package | Latest | Published | `typescript` in deps/peer/optional? | Supports TS 7? |
| --- | --- | --- | --- | --- |
| `eslint` (core) | **10.12.0** | **2026-10-02** | **None.** Only peer is optional `jiti` | **N/A — it has never needed TS.** No TS parser, no type-aware core rule. |
| `@eslint/js` | **10.0.1** | — | **None** (`peerDependencies` = `{eslint: ^10.0.0}` only) | N/A |
| `typescript-eslint` | **8.71.0** | **2026-09-28** | Peer: `typescript: ">=4.8.4 <6.1.0"` | **No — hard cap at `<6.1.0`** |
| `eslint-config-next` | **16.3.8** | **2026-09-30** | Dep: `typescript-eslint: "^8.46.0"`; peer `typescript: ">=3.3.1"` (optional) | **No — inherits the `<6.1.0` cap transitively** |
| `typescript` | **7.0.2** (`latest`) | **2026-07-08** | — | Ships **no JavaScript compiler API at all** |

The one thing that *has* changed since 20 Aug 2026: typescript-eslint now has **real, substantial, unmerged work-in-progress** on TS 7 — draft PR [#12803](https://github.com/typescript-eslint/typescript-eslint/pull/12803), 81 files, +5284/−240, 100 commits, still `isDraft: true` / `REVIEW_REQUIRED` as of 2026-10-04. That is a prototype behind an undocumented env var, not a shipped feature.

**This repo already implements Microsoft's officially documented workaround** and needs no change (§7).

---

## 1. ESLint core (`eslint`) — latest version and full dependency list

**CONFIRMED.** Source: `https://registry.npmjs.org/eslint/latest` (fetched 2026-10-04), corroborated by the packument `time` map.

- **Latest: `eslint@10.12.0`, published 2026-10-02.** (`dist-tags`: `latest: 10.12.0`, `maintenance: 9.39.5`, `next: 10.0.0-rc.2`. The packument was last modified 2026-10-02T20:08:19Z.)
- Recent cadence: 10.7.0 (2026-07-10) → 10.8.0 (07-24) → 10.9.0 (08-21) → 10.10.0 (09-04) → 10.11.0 (09-18) → 10.12.0 (10-02).
- `engines`: `node: "^20.19.0 || ^22.13.0 || >=24"`.

### 1.1 Does `typescript` appear anywhere? **No. — CONFIRMED**

Complete `dependencies` (30 entries, verbatim key + range, in npm's alphabetical order):

```json
{
  "@eslint-community/eslint-utils": "^4.8.0",
  "@eslint-community/regexpp": "^4.12.2",
  "@eslint/config-array": "^0.23.5",
  "@eslint/config-helpers": "^0.7.0",
  "@eslint/core": "^1.2.1",
  "@eslint/plugin-kit": "^0.7.3",
  "@humanfs/node": "^0.16.6",
  "@humanwhocodes/module-importer": "^1.0.1",
  "@humanwhocodes/retry": "^0.4.0",
  "@types/estree": "^1.0.6",
  "ajv": "^6.14.0",
  "cross-spawn": "^7.0.6",
  "debug": "^4.3.2",
  "escape-string-regexp": "^4.0.0",
  "esquery": "^1.7.0",
  "eslint-scope": "^9.1.2",
  "eslint-visitor-keys": "^5.0.1",
  "espree": "^11.2.0",
  "esutils": "^2.0.2",
  "fast-deep-equal": "^3.1.3",
  "file-entry-cache": "11.1.5 || >11.1.6 <12",
  "find-up": "^5.0.0",
  "glob-parent": "^6.0.2",
  "ignore": "^5.2.0",
  "imurmurhash": "^0.1.4",
  "is-glob": "^4.0.0",
  "json-stable-stringify-without-jsonify": "^1.0.1",
  "minimatch": "^10.2.5",
  "natural-compare": "^1.4.0",
  "optionator": "^0.9.3"
}
```

Note the parser story: the only parser-shaped dependency is **`espree`**, ESLint's own ECMAScript parser. There is no TypeScript parser anywhere in the graph.

- `dependencies`: **no `typescript`**.
- `peerDependencies`: **only `{"jiti": "*"}`**, and `peerDependenciesMeta` marks it **`optional: true`**.
- `optionalDependencies`: **not present** (the manifest has no `optionalDependencies` field at all).
- `exports`: `[".", "./rules", "./config", "./universal", "./package.json", "./use-at-your-own-risk"]` — **no TypeScript-parser entry point**. There is no built-in TS parser in ESLint core.
- `@eslint/js@10.0.1`: `dependencies` is **absent**; `peerDependencies` = `{"eslint": "^10.0.0"}`. No TS coupling. There is no `@eslint/js` TypeScript support.

**Verdict:** ESLint core continues to have **exactly zero** TypeScript coupling — no direct dependency, no peer dependency, no optional dependency, no built-in TS parser, no type-aware core rule, no `@eslint/js` TS support. The historically-true statement still holds for 10.12.0.

### 1.2 The nuance that is easy to miss — ESLint core *does* type-test itself against TS 7

**CONFIRMED.** From `eslint@10.12.0`'s `devDependencies` and `scripts` on the npm manifest:

- `devDependencies` include `typescript: "^6.0.3"` and `@typescript-eslint/parser: "^8.58.2"`.
- `scripts` include `"test:types:7.x": "npx -p @typescript/native-preview@latest -y -- tsgo -p tsconfig.types.json"` and `"test:types:all"` which chains `test:types`, `test:types:5.3`, `test:types:5.x`, `test:types:7.x`.

This is **dev-time type-checking of ESLint's own `.d.ts` files against the TS 7 native preview** — i.e. evidence that ESLint core's *public type declarations* are being kept compatible with TS 7. It is **not** support for linting TS 7 code, and it involves no runtime dependency. Do not cite this as "ESLint supports TS 7."

> Practical consequence for this repo: `eslint@10` requires Node `^20.19.0 || ^22.13.0 || >=24`. This repo pins `eslint: "^9"` and currently resolves `9.39.5` (which npm tags as `maintenance`). That is orthogonal to TS 7 but worth noting if you ever consider the ESLint 10 upgrade — see §7.

---

## 2. `typescript-eslint` — latest version and `peerDependencies.typescript`

**CONFIRMED.** Source: `https://registry.npmjs.org/typescript-eslint/latest` plus per-version manifests.

- **Latest: `typescript-eslint@8.71.0`, published 2026-09-28** (`dist-tags`: `latest: 8.71.0`, `canary: 8.71.1-alpha.11`; canaries publishing several times a day as of 2026-10-04).
- **`peerDependencies` (verbatim, unchanged):**
  ```json
  { "eslint": "^8.57.0 || ^9.0.0 || ^10.0.0",
    "typescript": ">=4.8.4 <6.1.0" }
  ```
- `dependencies`: `@typescript-eslint/{utils,parser,eslint-plugin,typescript-estree}` all pinned to `8.71.0`.
- There is **no `peerDependenciesMeta`**, so the `typescript` peer is **required, not optional**.

### 2.1 Does it still cap at `<6.1.0`? **Yes. — CONFIRMED, and unchanged across every release since your lockfile**

I diffed `peerDependencies` across every 8.x minor from your lockfile's version to latest:

| version | published | `peerDependencies.typescript` |
| --- | --- | --- |
| 8.66.0 | 2026-08-03 | `>=4.8.4 <6.1.0` |
| 8.67.0 | 2026-08-10 | `>=4.8.4 <6.1.0` |
| 8.68.0 | 2026-08-24 | `>=4.8.4 <6.1.0` |
| 8.69.0 | 2026-08-31 | `>=4.8.4 <6.1.0` |
| 8.70.0 | 2026-09-07 | `>=4.8.4 <6.1.0` |
| 8.70.1 | 2026-09-21 | `>=4.8.4 <6.1.0` |
| **8.71.0** | **2026-09-28** | **`>=4.8.4 <6.1.0`** |

**Zero changes to the TypeScript range.** There is no 9.x.

### 2.2 The range is enforced in code, not just declared — CONFIRMED (tarball inspection)

I downloaded and unpacked `@typescript-eslint/typescript-estree@8.71.0` and read its compiled `dist`:

- `package/dist/parseSettings/warnAboutTSVersion.js:47` → `exports.SUPPORTED_TYPESCRIPT_VERSIONS = '>=4.8.4 <6.1.0';`
- same file, line 52 → `const SUPPORTED_PRERELEASE_RANGES = [];` — **the prerelease allowance list is empty**, so even `7.0.0-rc`/`7.1.0-dev` are *not* in the supported set.
- line 54 → `semver.satisfies(ACTIVE_TYPESCRIPT_VERSION, [SUPPORTED_TYPESCRIPT_VERSIONS, ...SUPPORTED_PRERELEASE_RANGES].join(' || '))`
- The package does `require("typescript")` in **19 separate files** in `dist/`, and its only `peerDependencies` is `{ "typescript": ">=4.8.4 <6.1.0" }`.

Official docs agree — [`typescript-eslint.io/users/dependency-versions`](https://typescript-eslint.io/users/dependency-versions) states verbatim: *"The version range of TypeScript currently supported is `>=4.8.4 <6.1.0`."* The docs also note the peer range is deliberately left open *to let you install an unsupported version and get a warning rather than an install error* — the runtime guard still fires.

---

## 3. The TS 7 tracking issue ([#10940](https://github.com/typescript-eslint/typescript-eslint/issues/10940))

**CONFIRMED** (GitHub API, fetched 2026-10-04).

- **Title:** "Enhancement: Use TS 7 (tsgo / typescript-go) for type information"
- **State: OPEN.** Created 2025-03-11, last updated 2026-09-29. `closedAt: null`.
- **Labels:** `enhancement`, `accepting prs`, `team assigned`. **Milestone: none** (`"milestone": null`) — so there is **no linked milestone and therefore no ETA date** anywhere in GitHub.
- **23 comments.**

### 3.1 Maintainer statements — explicitly *no* ETA

**CONFIRMED**, verbatim quotes:

- **bradzacher, 2026-04-24T02:31:46Z** (responding to "typescript go is nearly stable"):
  > "There's nothing to bump here -- we're still waiting for the API to release. **We can't integrate without an API.**"
- **bradzacher, 2026-07-09T07:45:54Z:**
  > "For **now** - there is nothing we can do to support tsgo / TSv7. As mentioned in the blog post and highlighted above - there is currently no stable JS API. […] Until we have more information or things in the work, I'm going to lock this thread to keep noise to a minimum for everyone subscribed and waiting. If you require support - consider reaching out on discord."

  (The thread *was* locked; it was subsequently un-locked to accommodate the September activity below.)

### 3.2 The September 2026 change — this is the newest and most important development

**CONFIRMED.** Two comments from **JoshuaKGoldberg** (typescript-eslint maintainer):

- **2026-09-11T16:27:10Z:**
  > "I'm working on this. I don't know how long it will take."
- **2026-09-29T23:01:08Z** (the most recent activity on the issue):
  > "Status update: typescript-eslint's WIP TypeScript 7.1 support is looking more and more stable. The TypeScript team has been graciously working with us to fill in the APIs we need - thanks in particular to @andrewbranch as our point of contact recently.
  >
  > I've gotten #12803 ready for internal team review. Most of the time it's measuring slightly faster than the baseline of TypeScript 6, but then we keep finding performance improvements for TS6 that push its performance back the other way. Also a long trail of small semi-related tweaks that need to happen to make the TS7 changes less jarring.
  >
  > I'm going to clear the current round of filed TS6 performance issues so we can get one last clear baseline: #12746 → #12748, #12922 → #12923, #12936 → #12934 … then do a last round of performance investigations & improvements for #12803 before marking it as ready for review. This is difficult because a lot of the APIs we might want for optimizing (e.g. pre-querying many files' types at once) are not available in ESLint right now - #11677. **So we're not expecting performance to be significantly better with TS7 than TS6 at least for this initial IPC-based version.**"

**Interpretation (CONFIRMED as stated; the ETA inference is my reading):** work is genuinely in flight and Microsoft is collaborating (`@andrewbranch` is on the TypeScript team), but the maintainer explicitly says the remaining path is "a last round of performance investigations & improvements […] before marking it as ready for review." As of 2026-10-04 the PR is **still a draft**. Treat "when" as **uncertain**; treat "it will happen eventually" as **confirmed direction**.

### 3.3 Linked PRs

**CONFIRMED.** The one real implementation PR is:

**[#12803 — `feat(typescript-estree): add projectService.EXPERIMENTAL_backend for TypeScript 7.1 native parser support over IPC`](https://github.com/typescript-eslint/typescript-eslint/pull/12803)**

| field | value |
| --- | --- |
| Author | JoshuaKGoldberg |
| Created | 2026-08-31T21:17:50Z |
| Last updated | **2026-10-04T20:43:16Z** (i.e. it was being pushed *today*) |
| State | **OPEN**, `isDraft: **true**` |
| Mergeable | `MERGEABLE` |
| Review decision | `REVIEW_REQUIRED` |
| Size | +5284 / −240 across **81 files**, **100 commits** |
| CI | 42 status checks |
| Branch | `feat/typescript-7-native` → `main` |
| Labels / milestone | none / none |

What it does, from the PR body:

- Opt-in via `parserOptions: { projectService: { EXPERIMENTAL_backend: 'native' } }` — so it is **not** the default path, and there is no config that makes typescript-eslint use TS 7 today.
- Gated additionally by an **undocumented** `TYPESCRIPT_ESLINT_NATIVE_BACKEND` env var.
- Adds `packages/typescript-estree/src/native/` with four compatibility adapters: `nativeNodeAdapter`, `nativeTypeAdapter`, `nativeCheckerAdapter`, `nativeProgramAdapter` — a **facade that presents the classic `ts.*` surface over the TS 7.1 native API**.
- Enumerates the divergences the facade must paper over: `TypeParameterDeclaration.default` → `defaultType`; optional/definite markers collapsed into a `postfixToken`; `implements` elements are `TypeReference` not `ExpressionWithTypeArguments`; JSX closing `</` is one token; no `Namespace`/`GlobalAugmentation` node flags; `EndOfFile` not `EndOfFileToken`; identifiers have `text` but no `escapedText`; tuple targets lose `minLength`/`combinedFlags`; bigint literal types carry a `bigint`, not a `PseudoBigInt`.
- Native calls are **"a synchronous round trip to the separate `tsgo` process."**
- Performance numbers the author himself publishes: with `no-floating-promises`, native is roughly even (0.89–1.08×); with `recommendedTypeChecked` it is **1.13–1.56× slower** and uses **1.2–1.8× the memory**, hitting V8's default ~4 GB heap ceiling at 8,192 files.
- "CURRENT STATS WIP, WILL IMPROVE" — the author marks these numbers as a work-in-progress tracker, not a final result.

**Verdict on #3: the issue is open, there is no milestone and no ETA, and the linked PR is an unmerged draft. — CONFIRMED.**

---

## 4. Has TypeScript 7.1 shipped, and does it expose a JavaScript compiler API?

### 4.1 What has shipped — CONFIRMED (npm packument, fetched 2026-10-04)

`dist-tags` for `typescript`: `latest: 7.0.2`, `next: 7.1.0-dev.20261004.1`, `rc: 7.0.1-rc`, `beta: 6.0.0-beta`.

Stable 6.x/7.x release timeline:

| version | published |
| --- | --- |
| 6.0.0-beta | 2026-02-11 |
| 6.0.1-rc | 2026-03-06 |
| 6.0.2 | 2026-03-23 |
| 6.0.3 | 2026-04-16 |
| 7.0.1-rc | 2026-06-18 |
| **7.0.2** | **2026-07-08** |

- **TypeScript 7.0 (7.0.2) shipped on 2026-07-08 and is npm's `latest`.**
- **TypeScript 7.1 has NOT shipped.** It exists only as `7.1.0-dev.*` nightlies under the `next` tag, published daily (7.1.0-dev.20260926.1, …, **7.1.0-dev.20261004.1** at 2026-10-04T08:21:43Z).
- There is **no TypeScript 7.1 announcement** on the TypeScript devblog. Listing every "Announcing" post currently published: 7.0, 7.0 RC, 7.0 Beta, 6.0, 6.0 RC, 6.0 Beta, 5.9, 5.9 RC. **No 7.1 post exists.**
- `@typescript/native-preview` stopped publishing on **2026-07-07** (last: `7.0.0-dev.20260707.2`) — consistent with the 7.0 announcement's statement that nightlies "will soon resume under the standard typescript package with the next tag."

### 4.2 The 7.0 promise, verbatim — CONFIRMED

From [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/), section *"Running Side-by-Side with TypeScript 6.0"*:

> "While TypeScript 7.0 is here, **it does not ship with an API.** We expect **TypeScript 7.1 to ship with a new (and different) API**, but until then we have made it a priority to ensure TypeScript can be run side-by-side with TypeScript 6.0 for utilities that still need some programmatic access to the compiler (such as typescript-eslint)."

The same post is explicit about the blast radius, naming typescript-eslint directly:
> "Because some tools like **typescript-eslint** expect to import from `typescript` directly via peer dependencies, we recommend achieving this via npm aliases."

And about embedded tooling (Vue/MDX/Astro/Svelte/Angular, Volar):
> "This is mainly because **TypeScript 7 does not yet expose a stable programmatic API**, and so tools (such as Volar) which embed TypeScript into their own compilers and language services can only currently rely on TypeScript 6.0."

### 4.3 Did it? **Partially — an API exists in the 7.1 nightlies, and it is *not* the classic `ts.*` API. — CONFIRMED (tarball inspection)**

I downloaded and unpacked both `typescript@7.0.2` and `typescript@7.1.0-dev.20261004.1`.

**`typescript@7.0.2` — the main export is a stub. CONFIRMED by reading the file:**

`package/lib/version.cjs` is the entire file:
```js
const { version } = require("../package.json");
exports.version = version;
exports.versionMajorMinor = "7.0";
```
Its `exports` map is `{ ".": "./lib/version.cjs", "./unstable/fs": …, "./unstable/ast": …, "./unstable/sync": …, "./unstable/async": …, "./unstable/proto": …, "./unstable/ast/{is,clone,utils,factory,scanner,visitor}": … }`. There is no `ts.createProgram`, no `ts.SyntaxKind`, no `ts.ModuleKind` at the top level. **This is why `require("typescript")` under TS 7 yields an object with exactly two string properties**, and why typescript-eslint's module load crashes — it reads e.g. `ts.ModuleKind.Cjs` and gets `Cannot read properties of undefined`.

**`typescript@7.1.0-dev.20261004.1` — a real, substantial API, under `unstable/`. CONFIRMED:**

- Its `lib/version.cjs` is identical apart from `versionMajorMinor = "7.1"` — **the default `.` export is *still* just the version stub.** Anyone importing plain `typescript` still gets nothing.
- The new API is only reachable through the `unstable/*` subpath exports. New in 7.1 vs 7.0: `./unstable/path`, `./unstable/vscode`, `./schemas/jsconfig.schema.json`, `./schemas/tsconfig.schema.json`.
- `dist/api/sync/api.d.ts` exposes **classes**, not a namespace: `API`, `InternalAPI`, `Project`, `Program`, `Checker`, `Snapshot`, `LanguageService`, `BuildOrchestrator`, `ModuleResolver`, `Printer`, `RetainedSourceFile`, plus `TypeFlags`/`SymbolFlags`/`SyntaxKind`-adjacent enums. Methods are **lazy** (`type.getSymbol()` where classic TS exposed a plain `type.symbol`) — which is precisely the divergence typescript-eslint's adapters exist to hide.
- `dist/ast/index.d.ts` does export enums directly (`SyntaxKind`, `NodeFlags`, `ScriptKind`, …) plus `astnav`, `clone`, `is`, `jsdoc`, `modifiers`, `scanner`, `visitor` — so the AST vocabulary is reachable, just not the classic top-level `ts.*` namespace.
- `dist/api/syncChannel.js` confirms the transport: `import { spawn } from "node:child_process"` and `spawn(exe, [...args, "--pipe", pipePath])`. **The sync API is a synchronous facade over IPC to a spawned `tsgo` process** — matching #12803's "synchronous round trip to the separate `tsgo` process."
- An `async` variant exists at `./unstable/async` with the same classes and `Promise`-returning signatures.

**So: "did TS 7.1 ship an API?" — Not yet as a release. In the `next` nightlies, yes, a new API exists at `typescript/unstable/{sync,async,ast,proto,fs,path}`; it is explicitly marked unstable, it is not the classic `ts.*` API, it requires a separate process over IPC, and the main `.` export remains a version stub.**

### 4.4 Does typescript-eslint's tracking depend on it? **Yes, explicitly. — CONFIRMED**

The dependency is stated three separate ways:
1. bradzacher (2026-04-24): "**We can't integrate without an API.**"
2. bradzacher (2026-07-09): "there is currently **no stable JS API**."
3. JoshuaKGoldberg's PR is titled around **"TypeScript 7.1 native parser support"** and his 2026-09-29 comment credits `@andrewbranch` at Microsoft with "fill[ing] in the APIs we need."

typescript-eslint is therefore gated on the API stabilizing, not merely on it existing. #12803 targets `7.1`, not `7.0`.

---

## 5. Is there a newer typescript-eslint that supports TS 7?

**No. — CONFIRMED**

- Latest is `8.71.0` (2026-09-28). There is **no 9.x** on any dist-tag (`latest`, `canary`, `rc-v*`). The canary is `8.71.1-alpha.11`.
- The `8.67.0 → 8.71.0` window contains **no change to the TypeScript peer range** (§2.1). Release notes for [v8.71.0](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.71.0) contain one feature (`no-unsafe-enum-assignment`) and four fixes — **no mention of TypeScript 7 or the supported range**.
- **Support exists only inside the unmerged draft branch** `feat/typescript-7-native` (PR #12803). It is opt-in via `EXPERIMENTAL_backend: 'native'` and an undocumented env var. You cannot get it from npm.

### 5.1 Has typescript-eslint adopted the `typescript@7` `unstable/*` exports?

**YES — but only on the unmerged draft branch. — CONFIRMED**

PR #12803 is built directly on the 7.1 `unstable` API: it ships four adapters in `packages/typescript-estree/src/native/` that translate the native `Node`/`Type`/`Symbol`/`Signature`/`IndexInfo`/`Checker`/`Program` objects into classic `ts.Node`/`ts.TypeChecker`/`ts.Program` shapes, enumerating the divergences listed in §3.3. This is unambiguously an adoption of the new `unstable` surface (the "facade compatibility layer").

**None of this is in any published npm artifact** — `typescript-estree@8.71.0`'s published `dist` contains zero references to the native backend (I grepped: the only TS-related symbols are `require("typescript")` × 19 and `SUPPORTED_TYPESCRIPT_VERSIONS`).

---

## 6. Community workarounds in the wild

### 6.1 The npm-alias side-by-side layout — this is Microsoft's own recommendation, and it works

**CONFIRMED.** The 7.0 announcement gives the exact recipe, verbatim:

> `npm install -D typescript@npm:@typescript/typescript6`
> ```json
> { "devDependencies": { "typescript": "npm:@typescript/typescript6@^6.0.2" } }
> ```
> "Note that doing this will leave you only with a `tsc6` executable. To get 7.0's `tsc`, you can add another alias for TypeScript 7 and `npx tsc` will just work with 7.0:"
> ```json
> { "devDependencies": {
>     "@typescript/native": "npm:typescript@^7.0.2",
>     "typescript": "npm:@typescript/typescript6@^6.0.2"
> } }
> ```

The alias package's manifest confirms the mechanism — `@typescript/typescript6@6.0.2` (published 2026-07-06) declares `bin: { tsc6: "bin/tsc6" }` and `dependencies: { "@typescript/old": "npm:typescript@^6" }`, i.e. it **re-exports the real `typescript@6.0.3` API**, exactly as the blog says.

### 6.2 Does the `overrides` nesting trick work? **No — and real reports say so explicitly. — CONFIRMED**

You asked specifically about forcing typescript-eslint's subtree onto `@typescript/typescript6` while root `typescript` is `npm:typescript@^7`.

**That cannot work, and the reason is structural rather than a matter of tuning.** `overrides` can rewrite which *package* is installed, but it cannot make TS 7 expose an API it does not have. Under root `typescript@7`, anything importing the bare specifier `typescript` gets `{ version, versionMajorMinor }` — so the override either (a) has no effect because the subtree resolves `typescript@7` anyway and crashes, or (b) does apply and then you are, by definition, running typescript-eslint against TS 6, which is the alias approach with extra steps.

Real reports:

- **[@10940 comment, HolgerJeromin, 2026-07-01](https://github.com/typescript-eslint/typescript-eslint/issues/10940#issuecomment-1933560000)** — tried exactly the side-by-side layout and reported the failure mode with `typescript-eslint` **8.62.0**:
  ```
  ESLint: 10.4.1
  TypeError: Cannot read properties of undefined (reading 'Cjs')
      at .../typescript-estree/dist/create-program/shared.js:59:18
  ```
  This is the canonical signature of typescript-eslint resolving TS 7 instead of TS 6.
- **[@10940 comment, lukeapage, 2026-06-30](https://github.com/typescript-eslint/typescript-eslint/issues/10940)** — reports the alias layout "working fine" for them.
- **[@10940 comment, lukpsaxo, 2026-07-01](https://github.com/typescript-eslint/typescript-eslint/issues/10940)** — "We use typescript-eslint in typed mode and for us it just works (yarn package manager - linked mode)." Also flags that **nested `node_modules` copies of `typescript` are the usual culprit** when the layout goes wrong.

Note the difference between the two failure modes: `lukeapage`/`lukpsaxo` succeed, `HolgerJeromin` fails with `reading 'Cjs'` — because in the failing case a nested `typescript@7` was still being resolved by the typescript-eslint subtree. **The alias only works if the `typescript` specifier resolves to `@typescript/typescript6` everywhere typescript-eslint looks, with no nested TS 7 copy.**

### 6.3 How widespread is it? — CONFIRMED (GitHub code search, `npm:@typescript/typescript6`, fetched 2026-10-04)

A code search for `npm:@typescript/typescript6` returned **30+ real repositories**, including large ones:

- `kubernetes-client/javascript` (`tools/lint/package.json`)
- `grafana/grafana`, `mui/mui-x`, `TanStack/router`, `TanStack` (multiple packages), `ComposioHQ/composio`, `lightdash/lightdash`, `Lifeforge-app/lifeforge`, `statelyai/xstate`, `umijs/qiankun`, `immich-app/immich`, `neostandard/neostandard`, `saltyshiomix/nextron`, `sirmalloc/ccstatusline`, `gronxb/hot-updater`, `kailong321200875/vue-element-plus-admin`, `nartc/mapper`, `lmstudio-ai/lmstudio-js`, `im4codes/imcodes`, `assistant-ui/assistant-ui`

**`lightdash/lightdash`'s `.pnpmfile.cjs` is the most instructive artifact** — it is a pnpm hook that rewrites peers into deps, and its opening comment is the whole thesis:

```js
// TypeScript 7 omits the legacy compiler API; keep dependent tools on TypeScript 6.
const LEGACY_TYPESCRIPT_API_PACKAGE = 'npm:@typescript/typescript6@6.0.2';
// …for every pkg matching @typescript-eslint/* plus a hardcoded list
// (react-docgen-typescript, rollup-plugin-dts, ts-node, ts-unused-exports, cosmiconfig, …):
pkg.dependencies.typescript = LEGACY_TYPESCRIPT_API_PACKAGE;
delete pkg.peerDependencies.typescript;
```

That is the pnpm equivalent of the `overrides` idea — and note it applies to the *entire* `@typescript-eslint/*` scope, not just one package.

**ts-jest has published the same guidance as a first-party doc**: [`website/docs/guides/typescript-7.md`](https://github.com/kulshekhar/ts-jest/blob/main/website/docs/guides/typescript-7.md) ("Using TypeScript 7"). It recommends exactly the alias layout and says explicitly:

> "If npm reports `ERESOLVE` after replacing `typescript` with TypeScript 7 directly, **do not bypass the peer dependency check with `--legacy-peer-deps`.** Use the aliases above instead."

It also documents two things worth knowing: `ts-jest` will **not** silently fall back to `@typescript/typescript6`, and **Jest transform diagnostics come from the TS 6 API**, so they can differ from `tsc --noEmit` under TS 7.

### 6.4 Has anyone actually run ESLint type-aware rules against TS 7? — **Not in any released configuration. — CONFIRMED (no such report found)**

I found no report of ESLint type-aware linting successfully running against TS 7 *code*. What exists:
- The alias approach, which runs type-aware ESLint against a **TS 6.0.3 API** while `tsc` runs TS 7 (§6.1–6.3).
- PR #12803, whose own CI runs the project-service tests on **both backends** — i.e. real type-aware runs against the native backend, but only on an unmerged branch (§3.3).
- A user comment on #10940 (2026-04-24) reporting TS 7 compile-time improvements (20s → 3.5s) — but that is `tsc`, not ESLint.

**I could not run this web search exhaustively** (the search API returned an HTTP 402 insufficient-balance error and I fell back to GitHub's search API and direct HTTP), so treat "no success reports exist" as **strong but not exhaustive**.

### 6.5 Alternative linters that work with TS 7

**oxlint — YES, and it is genuinely type-aware on TS 7. — CONFIRMED**

- `oxlint@1.86.0`, published **2026-09-28**, declares `peerDependencies: { "vite-plus": "*", "oxlint-tsgolint": ">=7.0.2003" }` (optional).
- **`oxlint-tsgolint@7.0.2003`, published 2026-09-24** — described as *"High-performance type-aware TypeScript linter powered by typescript-go, for use with oxlint."* Ships a `tsgolint` binary and per-platform `@oxlint-tsgolint/*` binaries. 72 versions published since 2025-07-22.
- Official docs, [oxc.rs/docs/guide/usage/linter/type-aware](https://oxc.rs/docs/guide/usage/linter/type-aware): *"Type-aware linting is provided by tsgolint… `tsgolint` (Go) Builds TypeScript programs using typescript-go and executes type-aware rules, returning structured diagnostics to Oxlint."* Enable with `--type-aware` or `options.typeAware: true`.
- **Coverage claim (their own, so treat as a vendor claim — not independently verified):** *"Type-aware linting currently supports **59 out of 61** type-aware rules from typescript-eslint."*
- The integration is actively maintained — open PRs in `oxc-project/oxc` as recent as 2026-09-27 (`#27109`, `#26850`, `#26849`, `#26283`, `#26236`).

This is the most credible "type-aware linting on TS 7" path that actually ships today. Caveat: it is a *different* rule implementation with incomplete typescript-eslint parity, not a drop-in.

**Biome — structurally immune, but with its own type system. — CONFIRMED**

- `@biomejs/biome@2.5.15`, published **2026-09-30**. Its manifest has **no `dependencies` and no `peerDependencies`** — only 8 `optionalDependencies` for platform binaries. **Zero TypeScript coupling**, because Biome is a Rust binary with its own TypeScript parser; it never imports `typescript`.
- Therefore Biome is *unaffected* by the TS 7 API removal. However, Biome implements **its own** type inference (`js_analyze` / `js_type_info`) rather than consuming TypeScript's checker, so it is not a drop-in replacement for `recommended-type-checked`.
- I found **no explicit Biome changelog entry about TypeScript 7 support** (grep of the upstream `CHANGELOG.md` for "typescript 7"/"tsgo"/"typescript-go" returned nothing). **Uncertain** whether Biome has done specific TS 7 syntax-compat work; it doesn't need to for API reasons.

**ESLint with a non-TS-API parser — not a viable substitute. — CONFIRMED by reasoning from the manifests**

ESLint core's only bundled parser is `espree` (a JS/JSX parser with no TS syntax support), and `eslint@10.12.0`'s `exports` map contains no TypeScript parser entry. Every real TS parser in the ecosystem (`@typescript-eslint/parser`, `@babel/eslint-parser`, `oxc-parser`) either wraps the TS compiler API or ships its own TS implementation. **Speculation / low confidence on Babel specifically** — I did not audit `@babel/eslint-parser`; but note `@babel/parser` handles TS syntax natively, so a Babel-based ESLint parser would sidestep the API problem in principle. Not verified here.

---

## 7. `eslint-config-next`'s current typescript-eslint dependency range

**Still `^8.46.0`. UNCHANGED. — CONFIRMED**

- Your lockfile pins `eslint-config-next@16.3.6`. Its `dependencies` include `"typescript-eslint": "^8.46.0"`. `peerDependencies`: `{"eslint": ">=9.0.0", "typescript": ">=3.3.1"}`, with `peerDependenciesMeta` marking `typescript` **optional**.
- **Latest is `eslint-config-next@16.3.8`, published 2026-09-30** — same `typescript-eslint: "^8.46.0"`, same peers.

I scanned every stable `eslint-config-next` release published since 2026-01-01 for changes to that field. **There has not been a single change** — every 16.x release (`16.1.2` 2026-01-14 → `16.3.7` 2026-09-29 → `16.3.8` 2026-09-30) declares `typescript-eslint: ^8.46.0`. The 15.5.x backport line doesn't depend on typescript-eslint at all.

Note the practical nuance: because the range is `^8.46.0` (caret), it **will resolve to 8.71.0** on a fresh install — so you do get the newest 8.x. But it will never resolve past 8.x, and the `<6.1.0` TypeScript ceiling arrives transitively through typescript-eslint's own peer dependency. `eslint-config-next` declares **no TypeScript ceiling itself** — its own optional peer is `>=3.3.1`.

Community trackers confirm this is the recognized blocker, e.g. [`cloudfour/eslint-config#736`](https://github.com/cloudfour/eslint-config/issues/736) (open, 2026-09-30): *"TypeScript 7 is already npm's `latest`, so the ceiling is what holds projects back… Once a `typescript-eslint` release raises its ceiling to cover TypeScript 7: 1. Merge the Renovate PR… 2. Widen `peerDependencies.typescript`… 3. In each project, check the 'recreate' box for the closed TypeScript 7 Renovate PR."*

---

## 8. This repo's actual state — already correct, plus two corrections to the 20 Aug doc

### 8.1 The repo already uses the recommended layout — CONFIRMED by reading `package.json` and the installed tree

[`package.json`](../../package.json) lines 62 and 72:
```json
"@typescript/native": "npm:typescript@^7.0.2",
"typescript":        "npm:@typescript/typescript6@^6.0.2",
```

Resolved state from `package-lock.json` and `node_modules/.bin`:

| specifier | resolves to | bin provided |
| --- | --- | --- |
| `typescript` | `@typescript/typescript6@6.0.2` → re-exports `typescript@6.0.3` | `tsc6` → **Version 6.0.3** |
| `@typescript/native` | `typescript@7.0.2` | `tsc` → **Version 7.0.2** |
| `@typescript/old` | `typescript@6.0.3` (transitive of the alias) | `tsserver` |
| `typescript-eslint` | `8.66.0` (5 minors behind latest 8.71.0) | — |
| `eslint` | `9.39.5` (npm's `maintenance` tag; latest is 10.12.0) | — |
| `eslint-config-next` | `16.3.6` (latest 16.3.8) | — |

`node_modules/.bin/tsc --version` → `Version 7.0.2`; `node_modules/.bin/tsc6 --version` → `Version 6.0.3`. So `npm run typecheck` (`tsc --noEmit`) runs **TS 7.0.2**, and `npm run lint` (eslint 9.39.5 + typescript-eslint 8.66.0) runs against the **TS 6.0.3 API**. This is precisely Microsoft's documented layout. **No change is required.**

### 8.2 Two corrections to [`docs/research/typescript-7.md`](./typescript-7.md)

1. **`typescript@7.0.2` published 2026-07-08, not 20 Aug 2026.** The companion doc states "It was released on **20 Aug 2026** (tag `v7.0.2`…)" and cites source 3 as `github.com/microsoft/TypeScript/releases/tag/v7.0.2`. The npm packument `time` map gives `7.0.2 → 2026-07-08T15:55:18Z`, and the `microsoft/typescript-go` release list shows `typescript/v7.0.2 … 2026-07-08T15:58:56Z`. **20 Aug 2026 is the document's retrieval date, not the release date** — it appears to have been transposed. The same error is repeated in source 3's annotation.
2. **Issue #10940's labels changed.** The companion doc says the issue is "labeled 'blocked by external API'". As of 2026-09-29 the labels are `enhancement`, **`accepting prs`**, **`team assigned`** — "blocked by external API" is gone and "accepting prs" is new, reflecting the PR #12803 work. The doc's "15 blocking sub-issues" claim was not re-verified in this pass.

Also note the companion doc's §3.2 conclusion — "Upgrading Next (even to latest 16.3.1) does not change anything" — remains **correct**, and now has one more data point: 16.3.8 (2026-09-30) still declares `typescript-eslint: ^8.46.0` (§7).

---

## 9. Bottom line for a decision

**Confirmed facts:**
- ESLint core has no TypeScript coupling and does not need any; the TS 7 question is entirely `typescript-eslint`'s.
- `typescript-eslint@8.71.0` (2026-09-28) supports `typescript >=4.8.4 <6.1.0`. TS 7 is excluded by a required peer dependency, by a hardcoded runtime range check with an empty prerelease allowance, and by 19 `require("typescript")` call sites.
- `typescript@7.0.2` (2026-07-08) has no JavaScript compiler API; its main export is a 3-line version stub.
- TS 7.1 has not shipped. Its nightlies expose a new API only under `typescript/unstable/*`, and the plain `typescript` specifier still resolves to the version stub.
- The upstream fix is real but unmerged: PR #12803, open draft as of 2026-10-04, opt-in via `EXPERIMENTAL_backend: 'native'` plus an undocumented env var, and *slower* than TS 6 on `recommendedTypeChecked` in the author's own benchmarks.

**Uncertain:**
- When PR #12803 merges, and therefore when (or whether) a published typescript-eslint supports TS 7. No milestone, no ETA. JoshuaKGoldberg's own words, 2026-09-29: a "last round of performance investigations & improvements […] before marking it as ready for review."
- Whether the `tsc7` experience would even be a win for this repo once it lands — the same PR notes ESLint lacks the architectural hooks (#11677) to avoid IPC round-trips.

**Speculation (flagged, not relied upon):**
- That the peer ceiling will be raised to something like `<7.2.0` or `<8.0.0` in a future 8.x minor. Nothing in any primary source commits to a range.
- That ESLint 10 (`^20.19.0 || ^22.13.0 || >=24`) will become the default and that this repo's `eslint: "^9"` will need revisiting — orthogonal to TS 7, but 9.39.5 is now on npm's `maintenance` tag.

**Recommendation (no action needed now):** keep the existing alias layout. It is Microsoft's own documented approach, it resolves to the documented versions, and it is the only configuration where ESLint type-aware rules work at all. Re-evaluate when PR #12803 merges.

---

## Sources

All live sources retrieved **4 Oct 2026** via the npm registry JSON API, the GitHub API / `gh` CLI, or direct HTTP GET. GitHub source refs below are the API endpoints themselves.

**npm registry (primary):**
1. `https://registry.npmjs.org/eslint/latest` — `eslint@10.12.0`: full `dependencies`, `peerDependencies: {jiti: "*"}` + `peerDependenciesMeta.jiti.optional`, absent `optionalDependencies`, `exports` map, `engines`, `devDependencies` (`typescript ^6.0.3`, `@typescript-eslint/parser ^8.58.2`), `scripts["test:types:7.x"]`.
2. `https://registry.npmjs.org/eslint` (packument `time` map) — `10.12.0 → 2026-10-02`; `dist-tags` incl. `maintenance: 9.39.5`.
3. `https://registry.npmjs.org/@eslint/js/latest` — `@eslint/js@10.0.1`: no `dependencies`, `peerDependencies: {eslint: "^10.0.0"}`.
4. `https://registry.npmjs.org/typescript-eslint/latest` and `/typescript-eslint/{8.66.0…8.71.0}` — `8.71.0` (2026-09-28), peer range `>=4.8.4 <6.1.0` in every version.
5. `https://registry.npmjs.org/typescript-eslint` (packument `time`) — `8.66.0` 2026-08-03 … `8.71.0` 2026-09-28; `canary: 8.71.1-alpha.11`.
6. `https://registry.npmjs.org/typescript` (packument) — `dist-tags` (`latest 7.0.2`, `next 7.1.0-dev.20261004.1`, `rc 7.0.1-rc`); release timeline `6.0.0-beta` … `7.0.2 → 2026-07-08`.
7. `https://registry.npmjs.org/typescript/7.0.2` — `exports` map (`.` → `./lib/version.cjs`, `./unstable/*` only), `bin: {tsc}`, 19 `@typescript/typescript-*` platform packages.
8. `https://registry.npmjs.org/typescript/7.1.0-dev.20261004.1` — added `./unstable/path`, `./unstable/vscode`, `./schemas/*`; 7 platform optional deps.
9. `https://registry.npmjs.org/@typescript/typescript6` — `6.0.2` (2026-07-06), `bin: {tsc6}`, depends on `@typescript/old: npm:typescript@^6`.
10. `https://registry.npmjs.org/@typescript/native-preview` — last publish `7.0.0-dev.20260707.2` (2026-07-07), package discontinued in favour of `typescript@next`.
11. `https://registry.npmjs.org/@typescript-eslint/typescript-estree/8.71.0` + tarball — `dist/parseSettings/warnAboutTSVersion.js:47` (`SUPPORTED_TYPESCRIPT_VERSIONS`), `:52` (empty `SUPPORTED_PRERELEASE_RANGES`), 19 × `require("typescript")`.
12. `https://registry.npmjs.org/eslint-config-next/16.3.6` and `/latest` (16.3.8) and the `eslint-config-next` packument `time`+`versions` scan since 2026-01-01 — `typescript-eslint: ^8.46.0` unchanged throughout.
13. `https://registry.npmjs.org/oxlint/latest` — `1.86.0` (2026-09-28), optional peer `oxlint-tsgolint: ">=7.0.2003"`.
14. `https://registry.npmjs.org/oxlint-tsgolint` — `7.0.2003` (2026-09-24), `bin: {tsgolint}`, "powered by typescript-go".
15. `https://registry.npmjs.org/@biomejs/biome/latest` — `2.5.15` (2026-09-30), **no `dependencies`**, only 8 platform `optionalDependencies`.

**Package tarballs, unpacked and read directly:**
16. `typescript@7.0.2` → `lib/version.cjs` (2 exports), `package.json`.
17. `typescript@7.1.0-dev.20261004.1` → `lib/version.cjs`, `dist/api/{sync,async}/api.d.ts`, `dist/api/syncChannel.js`, `dist/ast/index.d.ts`.

**GitHub (primary):**
18. `https://github.com/typescript-eslint/typescript-eslint/issues/10940` — state, labels, milestone (`null`), all 23 comments.
19. `https://github.com/typescript-eslint/typescript-eslint/pull/12803` — state/`isDraft`/mergeable/reviewDecision, +5284/−240, 81 files, 100 commits, 42 checks, full body incl. divergence list and perf tables.
20. `https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.71.0` — release notes (no TS 7 content).
21. `https://github.com/microsoft/typescript-go/releases` — `typescript/v7.0.2 … 2026-07-08T15:58:56Z`.

**First-party documentation and community primary sources:**
22. `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/` — "Running Side-by-Side with TypeScript 6.0" (the no-API promise, the npm-alias recipe, `@typescript/typescript6`, `typescript@next` nightlies), "TypeScript and Embedded Languages", "The Road Forward".
23. `https://devblogs.microsoft.com/typescript/` (index) — no 7.1 announcement exists.
24. `https://typescript-eslint.io/users/dependency-versions/` — "The version range of TypeScript currently supported is `>=4.8.4 <6.1.0`"; prerelease support policy.
25. `https://oxc.rs/docs/guide/usage/linter/type-aware` — tsgolint architecture, `--type-aware`, "59 out of 61 type-aware rules from typescript-eslint" (vendor claim).
26. `https://github.com/kulshekhar/ts-jest/blob/main/website/docs/guides/typescript-7.md` — first-party TS 7 guide; "do not bypass the peer dependency check with `--legacy-peer-deps`".
27. `https://github.com/lightdash/lightdash/blob/main/.pnpmfile.cjs` — pnpm hook rewriting `typescript` peers for `@typescript-eslint/*` + 6 legacy-API tools.
28. GitHub code search for `npm:@typescript/typescript6` (2026-10-04) — 30+ adopting repositories incl. `kubernetes-client/javascript`, `grafana/grafana`, `mui/mui-x`, `TanStack/router`, `neostandard/neostandard`.
29. `https://github.com/cloudfour/eslint-config/issues/736` (open, 2026-09-30) — the `<6.1.0` ceiling identified as the blocker for a downstream config author.
30. `https://github.com/Xain3/pianoteq-remote/issues/4` (open, 2026-10-02) — "Remove TypeScript 6 alias when typescript-eslint supports TypeScript 7".
31. `https://github.com/mauroservienti/Zusammen/issues/7` (open, 2026-10-03) — "Upgrade to TypeScript 7 once typescript-eslint supports it"; pins TS to `~6.0.3` for exactly this reason.

**Repository state (this project):**
32. `package.json` (lines 62, 72), `package-lock.json`, `node_modules/.bin/` — the alias layout, resolved versions, and `tsc`/`tsc6` versions.

**Gaps / not verified (stated rather than papered over):**
- The `web_search` tool returned HTTP 402 (insufficient balance) for the whole session; GitHub's search API and direct HTTP were used instead. Broad community-blog coverage is therefore thinner than it would otherwise be — in particular the claim in §6.4 that no one has run type-aware ESLint against TS 7 should be read as "no such report surfaced in GitHub issues/PRs/code", not as an exhaustive web search.
- `@babel/eslint-parser` was not audited as a possible non-TS-API parser route (§6.5).
- The PR #12803 perf figures are the author's own, explicitly marked "WIP, WILL IMPROVE", on an M1 Max Mac Studio.
- Biome's TS 7 posture is inferred from its zero-`typescript`-dependency manifest; no explicit upstream Biome statement was found.
- `microsoft/typescript-go`'s issue tracker was only lightly sampled for TS 7.1 API-status issues (one closed hit, `microsoft/typescript-go#4532`); the API work may be tracked in PRs rather than issues.