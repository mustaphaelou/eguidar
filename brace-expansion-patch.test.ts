import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const BRACE_EXPANSION_FLOORS: Record<number, string> = {
  1: "1.1.21",
  5: "5.0.12",
}

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

function floorFor(version: string): string | null {
  const major = releaseParts(version)[0] ?? 0
  return BRACE_EXPANSION_FLOORS[major] ?? null
}

function installedCopies(): { path: string; version: string }[] {
  const lock = JSON.parse(
    readFileSync(path.join(process.cwd(), "package-lock.json"), "utf8")
  ) as {
    packages?: Record<string, { version?: unknown }>
  }
  return Object.entries(lock.packages ?? {})
    .filter(([key]) => /(^|\/)node_modules\/brace-expansion$/.test(key))
    .map(([key, entry]) => ({
      path: key.replace(/^.*node_modules\//, ""),
      version: typeof entry.version === "string" ? entry.version : "",
    }))
}

describe("satisfiesPatchFloor", () => {
  it("accepts each line's patch floor itself", () => {
    expect(satisfiesPatchFloor("1.1.21", BRACE_EXPANSION_FLOORS[1] ?? "")).toBe(
      true
    )
    expect(satisfiesPatchFloor("5.0.12", BRACE_EXPANSION_FLOORS[5] ?? "")).toBe(
      true
    )
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("1.1.22", BRACE_EXPANSION_FLOORS[1] ?? "")).toBe(
      true
    )
    expect(satisfiesPatchFloor("5.0.13", BRACE_EXPANSION_FLOORS[5] ?? "")).toBe(
      true
    )
    expect(satisfiesPatchFloor("5.1.0", BRACE_EXPANSION_FLOORS[5] ?? "")).toBe(
      true
    )
  })

  it("rejects the vulnerable releases below each floor", () => {
    expect(satisfiesPatchFloor("1.1.20", BRACE_EXPANSION_FLOORS[1] ?? "")).toBe(
      false
    )
    expect(satisfiesPatchFloor("1.1.18", BRACE_EXPANSION_FLOORS[1] ?? "")).toBe(
      false
    )
    expect(satisfiesPatchFloor("5.0.11", BRACE_EXPANSION_FLOORS[5] ?? "")).toBe(
      false
    )
    expect(satisfiesPatchFloor("5.0.9", BRACE_EXPANSION_FLOORS[5] ?? "")).toBe(
      false
    )
  })

  it("rejects prereleases and malformed versions", () => {
    expect(
      satisfiesPatchFloor("5.0.12-beta.1", BRACE_EXPANSION_FLOORS[5] ?? "")
    ).toBe(false)
    expect(satisfiesPatchFloor("", BRACE_EXPANSION_FLOORS[5] ?? "")).toBe(false)
    expect(
      satisfiesPatchFloor("garbage", BRACE_EXPANSION_FLOORS[5] ?? "")
    ).toBe(false)
  })

  it("knows a floor for each major line present in the tree", () => {
    expect(floorFor("1.1.18")).toBe("1.1.21")
    expect(floorFor("5.0.9")).toBe("5.0.12")
    expect(floorFor("4.0.0")).toBeNull()
  })
})

describe("installed brace-expansion (GHSA-q2hr-2g5m-vwhr, GHSA-qhr7-859c-m2p7, GHSA-6j4f-fj2g-mc7p)", () => {
  it("has at least one copy to guard", () => {
    expect(installedCopies().length).toBeGreaterThan(0)
  })

  it("puts every copy at or above its line's patch floor", () => {
    for (const copy of installedCopies()) {
      const floor = floorFor(copy.version)
      expect(
        floor,
        `aucun plancher connu pour ${copy.path}@${copy.version}`
      ).not.toBeNull()
      expect(
        satisfiesPatchFloor(copy.version, floor ?? ""),
        `${copy.path}@${copy.version} est sous le plancher ${String(floor)}`
      ).toBe(true)
    }
  })
})

describe("package.json overrides", () => {
  it("pins each major line to a range whose floor reaches that line's patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    for (const major of [1, 5] as const) {
      const range = manifest.overrides?.[`brace-expansion@${major}`]
      expect(
        range,
        `brace-expansion@${major} override missing from package.json`
      ).toBeDefined()
      const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
      expect(
        satisfiesPatchFloor(rangeFloor, BRACE_EXPANSION_FLOORS[major] ?? "")
      ).toBe(true)
    }
  })
})
