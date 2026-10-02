import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

const FAST_URI_PATCH_FLOOR = "3.1.8"

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

function installedFastUriVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "fast-uri/package.json"
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: unknown
    }
    return typeof manifest.version === "string" ? manifest.version : null
  } catch {
    return null
  }
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floor itself", () => {
    expect(satisfiesPatchFloor("3.1.8", FAST_URI_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("3.1.9", FAST_URI_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("3.2.0", FAST_URI_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("4.0.0", FAST_URI_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("3.1.7", FAST_URI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("3.1.0", FAST_URI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("3.0.0", FAST_URI_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("3.1.8-beta.1", FAST_URI_PATCH_FLOOR)).toBe(
      false
    )
    expect(satisfiesPatchFloor("", FAST_URI_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", FAST_URI_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed fast-uri (GHSA-hrr3-gc8f-f4qj)", () => {
  it("sits at or above the patch floor when present in the tree", () => {
    const version = installedFastUriVersion()
    if (version === null) return
    expect(satisfiesPatchFloor(version, FAST_URI_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json overrides", () => {
  it("pins fast-uri to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.["fast-uri"]
    expect(range, "fast-uri override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, FAST_URI_PATCH_FLOOR)).toBe(true)
  })
})
