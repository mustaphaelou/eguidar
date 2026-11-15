import { createRequire } from "node:module"

import { describe, expect, it } from "vitest"

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
