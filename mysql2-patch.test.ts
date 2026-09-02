import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

const MYSQL2_PATCH_FLOOR = "3.22.0"

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

function installedMysql2Version(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "mysql2/package.json"
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
    expect(satisfiesPatchFloor("3.22.0", MYSQL2_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("3.22.1", MYSQL2_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("3.23.0", MYSQL2_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("4.0.0", MYSQL2_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("3.21.1", MYSQL2_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("3.15.3", MYSQL2_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("2.9.9", MYSQL2_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("3.22.0-beta.1", MYSQL2_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", MYSQL2_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", MYSQL2_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed mysql2 (GHSA-3f6p-5ww8-9rcr)", () => {
  it("sits at or above the patch floor when present in the tree", () => {
    const version = installedMysql2Version()
    if (version === null) return
    expect(satisfiesPatchFloor(version, MYSQL2_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json overrides", () => {
  it("pins mysql2 to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.mysql2
    expect(range, "mysql2 override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, MYSQL2_PATCH_FLOOR)).toBe(true)
  })
})
