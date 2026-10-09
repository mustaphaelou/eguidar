import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

const IP_ADDRESS_PATCH_FLOOR = "10.7.1"

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

function installedIpAddressVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "ip-address/package.json"
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
    expect(satisfiesPatchFloor("10.7.1", IP_ADDRESS_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("10.7.3", IP_ADDRESS_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("10.8.0", IP_ADDRESS_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("11.0.0", IP_ADDRESS_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("10.7.0", IP_ADDRESS_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("10.5.0", IP_ADDRESS_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("10.4.0", IP_ADDRESS_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("9.1.0", IP_ADDRESS_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("10.7.1-beta.1", IP_ADDRESS_PATCH_FLOOR)).toBe(
      false
    )
    expect(satisfiesPatchFloor("", IP_ADDRESS_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", IP_ADDRESS_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed ip-address (GHSA-rpw4-54j3-4h4q, GHSA-2vr4-cq9g-pvrc, GHSA-j6r3-76f7-8jcv, GHSA-h3mg-xc3c-68pw)", () => {
  it("sits at or above the patch floor when present in the tree", () => {
    const version = installedIpAddressVersion()
    if (version === null) return
    expect(satisfiesPatchFloor(version, IP_ADDRESS_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json overrides", () => {
  it("pins ip-address to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.["ip-address"]
    expect(range, "ip-address override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, IP_ADDRESS_PATCH_FLOOR)).toBe(true)
  })
})
