import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

// Dependabot alert #96 (GHSA-g3hv-75wg-m249, CVE-2026-118764). During the first
// phase of pattern preprocessing, minimatch rewrites `**/../` into two
// patterns and re-runs the pass until nothing changes, so N occurrences become
// 2**N patterns; the second phase then compares every pair, which is quadratic
// in that set. 11.0.1 is the first release that stops the first phase at
// `braceExpandMax` and skips the pairwise pass above 1000 patterns. Every copy
// in the tree must therefore sit at or above 11.0.1, which only the `overrides`
// field can arrange: every consumer still asks for ^3.x (ESLint itself, its
// plugins) or ^10.x (typescript-estree, @ts-morph/common).
const MINIMATCH_PATCH_FLOOR = "11.0.1"

function releaseParts(version: string): number[] {
  const release = version.split("-", 1)[0] ?? ""
  return release.split(".").map((part) => Number.parseInt(part, 10))
}

function satisfiesPatchFloor(version: string, floor: string): boolean {
  if (version.includes("-")) return false
  const [major = 0, minor = 0, patch = 0] = releaseParts(version)
  const [floorMajor = 0, floorMinor = 0, floorPatch = 0] = releaseParts(floor)
  if (major !== floorMajor) return major > floorMajor
  if (minor !== floorMinor) return minor > floorMinor
  return patch >= floorPatch
}

type Entree = {
  version?: string
}

function arbre(): Record<string, Entree> {
  const lock = JSON.parse(
    readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8")
  ) as { packages?: Record<string, Entree> }
  return lock.packages ?? {}
}

function copies(
  dans: Record<string, Entree>
): { chemin: string; version: string }[] {
  return Object.entries(dans)
    .filter(([cle]) => /(^|\/)node_modules\/minimatch$/.test(cle))
    .map(([cle, entree]) => ({
      chemin: cle.replace(/^.*?node_modules\//, ""),
      version: typeof entree.version === "string" ? entree.version : "",
    }))
}

type MinimatchConstructeur = new (
  pattern: string,
  options?: Record<string, unknown>
) => { set: unknown[]; match(path: string): boolean }

function classeMinimatch(): MinimatchConstructeur {
  const paquet = createRequire(import.meta.url)("minimatch") as {
    Minimatch: MinimatchConstructeur
  }
  return paquet.Minimatch
}

function motifAmplifie(groupes: number): string {
  return "**/../a/b/".repeat(groupes) + "c"
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floor itself", () => {
    expect(satisfiesPatchFloor("11.0.1", MINIMATCH_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("11.0.2", MINIMATCH_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("11.1.0", MINIMATCH_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("12.0.0", MINIMATCH_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("11.0.0", MINIMATCH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("10.2.6", MINIMATCH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("9.0.9", MINIMATCH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("3.1.5", MINIMATCH_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("11.0.1-beta.1", MINIMATCH_PATCH_FLOOR)).toBe(
      false
    )
    expect(satisfiesPatchFloor("", MINIMATCH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", MINIMATCH_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed minimatch (GHSA-g3hv-75wg-m249, CVE-2026-118764)", () => {
  it("has at least one copy to guard", () => {
    expect(copies(arbre()).length).toBeGreaterThan(0)
  })

  it("puts every copy at or above the patch floor", () => {
    for (const copie of copies(arbre())) {
      expect(
        satisfiesPatchFloor(copie.version, MINIMATCH_PATCH_FLOOR),
        `${copie.chemin}@${copie.version} est sous le plancher ${MINIMATCH_PATCH_FLOOR}`
      ).toBe(true)
    }
  })
})

describe("package.json overrides", () => {
  it("pins minimatch to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.minimatch
    expect(range, "minimatch override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, MINIMATCH_PATCH_FLOOR)).toBe(true)
  })
})

describe("the patched first phase bounds the **/../ expansion", () => {
  it("stops at braceExpandMax where the vulnerable line doubled the set", () => {
    const Minimatch = classeMinimatch()
    const groups = 5
    const pattern = motifAmplifie(groups)

    // The vulnerable line (10.2.6) rewrites every `**/../<p>/<p2>` occurrence
    // into two patterns and ignores the cap, so five occurrences become 2**5.
    const doubled = new Minimatch(pattern, { optimizationLevel: 2 })
    expect(doubled.set.length).toBe(2 ** groups)

    // 11.0.1 checks `globParts.length >= braceExpandMax` before every split, so
    // a lowered cap holds even though the pattern asks for 32 patterns.
    const bounded = new Minimatch(pattern, {
      optimizationLevel: 2,
      braceExpandMax: 8,
    })
    expect(bounded.set.length).toBe(8)
  })

  // Known limitation of forcing 11 across the tree: eslint-plugin-import,
  // eslint-plugin-react and eslint-plugin-jsx-a11y still call minimatch's v3
  // default export, which 11 no longer provides, so their glob-option rules
  // (import/order pathGroups, import/extensions, custom component lists in
  // react/jsx-a11y) would throw until those plugins migrate. This repository's
  // eslint.config.mjs enables none of them, and no consumer range accepts ^11
  // yet, so there is no alternative while alert #96 stands.
  it("keeps the entry points its consumers call", () => {
    const paquet = createRequire(import.meta.url)("minimatch") as {
      Minimatch: MinimatchConstructeur
      minimatch: (path: string, pattern: string, options?: object) => boolean
    }

    // ESLint, @eslint/config-array and @eslint/eslintrc build `new Minimatch`.
    const glob = new paquet.Minimatch("src/**/*.ts", { dot: true })
    expect(glob.match("src/a/b.ts")).toBe(true)
    expect(glob.match("src/a/b.js")).toBe(false)

    // typescript-estree and @ts-morph/common call the named `minimatch`.
    expect(paquet.minimatch("src/a/b.ts", "src/**/*.ts", { dot: true })).toBe(
      true
    )
    expect(paquet.minimatch("src/a/b.js", "src/**/*.ts", { dot: true })).toBe(
      false
    )
  })
})
