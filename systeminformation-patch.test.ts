import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

const SYSTEMINFORMATION_PATCH_FLOOR = "5.33.16"

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

function installedSysteminformationVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "systeminformation/package.json"
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
    expect(satisfiesPatchFloor("5.33.16", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      true
    )
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("5.33.17", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      true
    )
    expect(satisfiesPatchFloor("5.34.0", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      true
    )
    expect(satisfiesPatchFloor("6.0.0", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      true
    )
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("5.33.15", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      false
    )
    expect(satisfiesPatchFloor("5.33.1", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      false
    )
    expect(satisfiesPatchFloor("5.32.0", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      false
    )
  })

  it("rejects prereleases and malformed versions", () => {
    expect(
      satisfiesPatchFloor("5.33.16-beta.1", SYSTEMINFORMATION_PATCH_FLOOR)
    ).toBe(false)
    expect(satisfiesPatchFloor("", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      false
    )
  })
})

describe("installed systeminformation (GHSA-3f7j-7jwc-fxfj, CVE-2026-116576)", () => {
  it("sits at or above the patch floor when present in the tree", () => {
    const version = installedSysteminformationVersion()
    if (version === null) return
    expect(satisfiesPatchFloor(version, SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      true
    )
  })
})

describe("package.json overrides", () => {
  it("pins systeminformation to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.["systeminformation"]
    expect(
      range,
      "systeminformation override missing from package.json"
    ).toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, SYSTEMINFORMATION_PATCH_FLOOR)).toBe(
      true
    )
  })
})
