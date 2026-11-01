import { existsSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

// 1.7.7 is the release that closes every open better-auth advisory:
// - GHSA-965c-763c-88jm (critical): an OAuth state value is accepted as a
//   Magic Link token, so an attacker can sign in as any known address;
// - GHSA-r4xp-prcw-77qf (high): an OAuth Proxy deployment lets an attacker
//   sign in as another user;
// - GHSA-q84f-53jg-9ppm (high): device login approval shows neither the
//   requesting client nor its permissions (patched in 1.7.0-rc.3);
// - GHSA-44jh-23m7-hpcf (low): concurrent drizzle-adapter requests exceed
//   PostgreSQL-backed rate limits.
const BETTER_AUTH_PATCH_FLOOR = "1.7.7"

const BETTER_AUTH_ADVISORIES = [
  "GHSA-965c-763c-88jm",
  "GHSA-r4xp-prcw-77qf",
  "GHSA-q84f-53jg-9ppm",
  "GHSA-44jh-23m7-hpcf",
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

function installedManifest(packageName: string): { version?: unknown } | null {
  try {
    let directory = path.dirname(
      createRequire(import.meta.url).resolve(packageName)
    )
    while (directory !== path.dirname(directory)) {
      const manifestPath = path.join(directory, "package.json")
      if (existsSync(manifestPath)) {
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          name?: unknown
          version?: unknown
        }
        if (manifest.name === packageName) return manifest
      }
      directory = path.dirname(directory)
    }
    return null
  } catch {
    return null
  }
}

function installedBetterAuthVersion(): string | null {
  const version = installedManifest("better-auth")?.version
  return typeof version === "string" ? version : null
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floor itself", () => {
    expect(satisfiesPatchFloor("1.7.7", BETTER_AUTH_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("1.7.8", BETTER_AUTH_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("1.7.15", BETTER_AUTH_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("1.8.0", BETTER_AUTH_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("2.0.0", BETTER_AUTH_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floor", () => {
    expect(satisfiesPatchFloor("1.7.6", BETTER_AUTH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("1.6.34", BETTER_AUTH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("1.6.26", BETTER_AUTH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("1.4.0-beta.18", BETTER_AUTH_PATCH_FLOOR)).toBe(
      false
    )
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("1.7.7-beta.1", BETTER_AUTH_PATCH_FLOOR)).toBe(
      false
    )
    expect(satisfiesPatchFloor("", BETTER_AUTH_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", BETTER_AUTH_PATCH_FLOOR)).toBe(false)
  })
})

describe(`installed better-auth (${BETTER_AUTH_ADVISORIES.join(", ")})`, () => {
  it("sits at or above the patch floor", () => {
    const version = installedBetterAuthVersion()
    expect(
      version,
      "better-auth not resolvable in the installed tree"
    ).not.toBeNull()
    expect(satisfiesPatchFloor(version ?? "", BETTER_AUTH_PATCH_FLOOR)).toBe(
      true
    )
  })

  it("keeps the bundled core and prisma adapter on the same release", () => {
    const version = installedBetterAuthVersion()
    for (const packageName of [
      "@better-auth/core",
      "@better-auth/prisma-adapter",
    ]) {
      const adapter = installedManifest(packageName)
      expect(adapter, `${packageName} not resolvable`).not.toBeNull()
      expect(adapter?.version, `${packageName} drifted from better-auth`).toBe(
        version
      )
    }
  })
})

describe("package.json dependency", () => {
  it("pins better-auth to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> }
    const range = manifest.dependencies?.["better-auth"]
    expect(
      range,
      "better-auth dependency missing from package.json"
    ).toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, BETTER_AUTH_PATCH_FLOOR)).toBe(true)
  })
})
