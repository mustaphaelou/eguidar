import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { load } from "js-yaml"
import { describe, expect, it } from "vitest"

declare module "js-yaml" {
  interface LoadOptions {
    maxTotalMergeKeys?: number | undefined
  }
}

const JSYAML_PATCH_FLOOR = "4.3.2"

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

function installedJsYamlVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "js-yaml/package.json"
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: unknown
    }
    return typeof manifest.version === "string" ? manifest.version : null
  } catch {
    return null
  }
}

function emptyMergeSources(n: number, k: number): string {
  return (
    "arr: &arr [" + "{}, ".repeat(n).slice(0, -2) + "]\n" +
    "targets:\n" +
    "  - <<: *arr\n".repeat(k)
  )
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floor itself", () => {
    expect(satisfiesPatchFloor("4.3.2", JSYAML_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("4.3.3", JSYAML_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("4.4.0", JSYAML_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("5.0.0", JSYAML_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("4.3.1", JSYAML_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("4.0.0", JSYAML_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("3.15.1", JSYAML_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("4.3.2-beta.1", JSYAML_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", JSYAML_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", JSYAML_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed js-yaml (GHSA-2883-xcg3-v3hh)", () => {
  it("sits at or above the patch floor when present in the tree", () => {
    const version = installedJsYamlVersion()
    if (version === null) return
    expect(satisfiesPatchFloor(version, JSYAML_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json overrides", () => {
  it("pins js-yaml to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.jsYaml ?? manifest.overrides?.["js-yaml"]
    expect(range, "js-yaml override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, JSYAML_PATCH_FLOOR)).toBe(true)
  })
})

describe("empty merge sources are budgeted (CVE-2026-84375)", () => {
  it("throws when repeated empty merge sources exhaust the budget", () => {
    expect(() =>
      load(emptyMergeSources(20, 20), { maxTotalMergeKeys: 10 })
    ).toThrow(/maxTotalMergeKeys/)
  })

  it("throws for a single empty merge source when the budget is zero", () => {
    expect(() =>
      load("arr: &a [{}]\nt: {<<: *a}", { maxTotalMergeKeys: 0 })
    ).toThrow(/maxTotalMergeKeys/)
  })

  it("still throws for non-empty merge sources at the same budget", () => {
    expect(() =>
      load("base: &b {a: 1}\nt: {<<: *b}", { maxTotalMergeKeys: 0 })
    ).toThrow(/maxTotalMergeKeys/)
  })

  it("rejects abnormal merge sequences outright", () => {
    expect(() => load(emptyMergeSources(5000, 1), {})).toThrow(
      /abnormal merge sequence size/
    )
  })

  it("keeps ordinary merges working", () => {
    expect(load("defaults: &d {a: 1}\nx: {<<: *d, b: 2}", {})).toEqual({
      defaults: { a: 1 },
      x: { a: 1, b: 2 },
    })
  })
})
