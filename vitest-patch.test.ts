import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

// Dependabot alert #69 (GHSA-xp26-3454-mjgp, CVE-2026-112950): on Windows a
// `..\` segment survives the POSIX join in @vitest/mocker's redirect
// registration, so the allowlist accepts the string while readFile() resolves
// it outside the Vite root. 4.1.12 rewrites the pathname's backslashes before
// the allowlist check. The same release closes alert #70
// (GHSA-qxg6-89mg-rqv8, CVE-2026-112949), where a manual mock's URL escaped
// into the generated module source.
const VITEST_PATCH_FLOOR = "4.1.12"

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

function installedVersion(packageName: string): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      `${packageName}/package.json`
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
    expect(satisfiesPatchFloor("4.1.12", VITEST_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("4.1.13", VITEST_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("4.2.0", VITEST_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("5.0.0", VITEST_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("4.1.11", VITEST_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("4.1.0", VITEST_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("4.0.18", VITEST_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("4.1.12-beta.1", VITEST_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", VITEST_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", VITEST_PATCH_FLOOR)).toBe(false)
  })
})

describe("installed vitest (GHSA-xp26-3454-mjgp, GHSA-qxg6-89mg-rqv8)", () => {
  it("sits at or above the patch floor", () => {
    const version = installedVersion("vitest")
    expect(
      version,
      "vitest not resolvable in the installed tree"
    ).not.toBeNull()
    expect(satisfiesPatchFloor(version ?? "", VITEST_PATCH_FLOOR)).toBe(true)
  })

  it("carries an @vitest/mocker at or above the patch floor", () => {
    const version = installedVersion("@vitest/mocker")
    expect(
      version,
      "@vitest/mocker not resolvable in the installed tree"
    ).not.toBeNull()
    expect(satisfiesPatchFloor(version ?? "", VITEST_PATCH_FLOOR)).toBe(true)
  })
})

describe("package.json dependency floors", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(process.cwd(), "package.json"), "utf8")
  ) as {
    devDependencies?: Record<string, string>
    overrides?: Record<string, string>
  }

  it("pins vitest to a range whose floor reaches the patch floor", () => {
    const range = manifest.devDependencies?.vitest
    expect(range, "vitest missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, VITEST_PATCH_FLOOR)).toBe(true)
  })

  it("pins @vitest/mocker to a range whose floor reaches the patch floor", () => {
    const range = manifest.overrides?.["@vitest/mocker"]
    expect(
      range,
      "@vitest/mocker override missing from package.json"
    ).toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, VITEST_PATCH_FLOOR)).toBe(true)
  })
})
