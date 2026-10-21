import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

// Dependabot alerts #68 (GHSA-5r4p-p66f-jhc7, CVE-2026-111757) and its
// predecessors GHSA-gqvv-2mrq-wpjv, GHSA-g6gw-c38x-mqfc and
// GHSA-crvj-82cr-hjcx. Alert #68 is the highest floor: serveStatic decoded the
// request path a second time, so a crafted request could route as one path and
// be served as another, skipping the middleware mounted on the static prefix.
const HONO_PATCH_FLOOR = "4.13.11"
const MAX_PACKAGE_ROOT_WALK_DEPTH = 8

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

function installedHonoVersion(): string | null {
  let entryPath: string
  try {
    entryPath = createRequire(import.meta.url).resolve("hono")
  } catch {
    return null
  }
  let dir = path.dirname(entryPath)
  for (let depth = 0; depth < MAX_PACKAGE_ROOT_WALK_DEPTH; depth++) {
    const manifestPath = path.join(dir, "package.json")
    if (existsSync(manifestPath)) {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: unknown
        version?: unknown
      }
      if (manifest.name === "hono") {
        return typeof manifest.version === "string" ? manifest.version : null
      }
    }
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
  return null
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floor itself", () => {
    expect(satisfiesPatchFloor("4.13.11", HONO_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("4.13.12", HONO_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("4.14.0", HONO_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("5.0.0", HONO_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("4.13.10", HONO_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("4.13.7", HONO_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("4.13.4", HONO_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("4.11.4", HONO_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("4.13.11-beta.1", HONO_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", HONO_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", HONO_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed hono (GHSA-5r4p-p66f-jhc7, GHSA-gqvv-2mrq-wpjv, GHSA-g6gw-c38x-mqfc, GHSA-crvj-82cr-hjcx)", () => {
  it("sits at or above the patch floor", () => {
    const version = installedHonoVersion()
    expect(version, "hono not resolvable in the installed tree").not.toBeNull()
    expect(satisfiesPatchFloor(version ?? "", HONO_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json overrides", () => {
  it("pins hono to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.hono
    expect(range, "hono override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, HONO_PATCH_FLOOR)).toBe(true)
  })
})
