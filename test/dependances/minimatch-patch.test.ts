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
    const occurrences = 5
    const pattern = motifAmplifie(occurrences)

    const doubled = new Minimatch(pattern, { optimizationLevel: 2 })
    expect(doubled.set.length).toBe(2 ** occurrences)

    const bounded = new Minimatch(pattern, {
      optimizationLevel: 2,
      braceExpandMax: 8,
    })
    expect(bounded.set.length).toBe(8)
  })

  it("keeps the entry points its consumers call", () => {
    const paquet = createRequire(import.meta.url)("minimatch") as {
      Minimatch: MinimatchConstructeur
      minimatch: (path: string, pattern: string, options?: object) => boolean
    }

    const glob = new paquet.Minimatch("src/**/*.ts", { dot: true })
    expect(glob.match("src/a/b.ts")).toBe(true)
    expect(glob.match("src/a/b.js")).toBe(false)

    expect(paquet.minimatch("src/a/b.ts", "src/**/*.ts", { dot: true })).toBe(
      true
    )
    expect(paquet.minimatch("src/a/b.js", "src/**/*.ts", { dot: true })).toBe(
      false
    )
  })
})
