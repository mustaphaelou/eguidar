import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

// 16.4.1 is the release that closes GHSA-673q-mjm6-r5xr (RCE in `use cache`
// functions returning typed arrays), GHSA-2464-fhr4-w9xw (Image Optimization
// SVG RCE) and GHSA-p3m5-59mp-jv5r (Server Action DoS). All three affect
// >=16.0.0 <=16.4.0.
const NEXT_PATCH_FLOOR = "16.4.1"

const NEXT_ADVISORIES = [
  "GHSA-p293-qw3h-jr36",
  "GHSA-2xp9-vwfh-vxw4",
  "GHSA-vcvr-r3jv-pc5j",
  "GHSA-673q-mjm6-r5xr",
  "GHSA-2464-fhr4-w9xw",
  "GHSA-p3m5-59mp-jv5r",
]

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

function installedNextVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "next/package.json"
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
    expect(satisfiesPatchFloor("16.4.1", NEXT_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("16.4.2", NEXT_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("16.5.0", NEXT_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("17.0.0", NEXT_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("16.4.0", NEXT_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("16.3.8", NEXT_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("16.3.6", NEXT_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("16.2.0", NEXT_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("15.5.25", NEXT_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("16.4.1-canary.0", NEXT_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", NEXT_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", NEXT_PATCH_FLOOR)).toBe(false)
  })
})

describe(`installed next (${NEXT_ADVISORIES.join(", ")})`, () => {
  it("sits at or above the patch floor", () => {
    const version = installedNextVersion()
    expect(version, "next not resolvable in the installed tree").not.toBeNull()
    expect(satisfiesPatchFloor(version ?? "", NEXT_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json dependency", () => {
  it("pins next to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> }
    const range = manifest.dependencies?.next
    expect(range, "next dependency missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, NEXT_PATCH_FLOOR)).toBe(true)
  })
})
