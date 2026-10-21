import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

// Dependabot alert #66 (GHSA-587h-7wmj-h5pm, CVE-2026-112942), with its
// siblings GHSA-698v-4r3x-3vcv and GHSA-r825-w8mm-5pxw. vite inlines
// launch-editor; all three fixes land in launch-editor 2.14.2, which vite
// first shipped in 8.3.3. The launch-editor package itself never enters the
// tree, so the guard pins the copy borne by vite.
const VITE_PATCH_FLOOR = "8.3.3"
const LAUNCH_EDITOR_PATCH_FLOOR = "2.14.2"

const LAUNCH_EDITOR_VERSION = /launch-editor@(\d+\.\d+\.\d+)/g

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

function installedViteVersion(): string | null {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "vite/package.json"
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: unknown
    }
    return typeof manifest.version === "string" ? manifest.version : null
  } catch {
    return null
  }
}

function javascriptFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return javascriptFilesUnder(entryPath)
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : []
  })
}

function launchEditorVersions(): string[] {
  try {
    const manifestPath = createRequire(import.meta.url).resolve(
      "launch-editor/package.json"
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      version?: unknown
    }
    if (typeof manifest.version === "string") return [manifest.version]
  } catch {
    // vite inlines launch-editor; fall through to the bundled copy.
  }

  const viteManifestPath = createRequire(import.meta.url).resolve(
    "vite/package.json"
  )
  const distDirectory = path.join(path.dirname(viteManifestPath), "dist")
  const versions = new Set<string>()
  for (const file of javascriptFilesUnder(distDirectory)) {
    const source = readFileSync(file, "utf8")
    for (const match of source.matchAll(LAUNCH_EDITOR_VERSION)) {
      if (match[1]) versions.add(match[1])
    }
  }
  return [...versions]
}

describe("satisfiesPatchFloor", () => {
  it("accepts the patch floors themselves", () => {
    expect(satisfiesPatchFloor("8.3.3", VITE_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("2.14.2", LAUNCH_EDITOR_PATCH_FLOOR)).toBe(true)
  })

  it("accepts later patch, minor and major releases", () => {
    expect(satisfiesPatchFloor("8.3.5", VITE_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("8.4.0", VITE_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("9.0.0", VITE_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("2.14.3", LAUNCH_EDITOR_PATCH_FLOOR)).toBe(true)
    expect(satisfiesPatchFloor("2.15.0", LAUNCH_EDITOR_PATCH_FLOOR)).toBe(true)
  })

  it("rejects the vulnerable releases below the floors", () => {
    expect(satisfiesPatchFloor("8.3.2", VITE_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("8.3.0", VITE_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("8.2.3", VITE_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("2.14.1", LAUNCH_EDITOR_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("2.14.0", LAUNCH_EDITOR_PATCH_FLOOR)).toBe(false)
  })

  it("rejects prereleases and malformed versions", () => {
    expect(satisfiesPatchFloor("8.3.3-beta.1", VITE_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("", VITE_PATCH_FLOOR)).toBe(false)
    expect(satisfiesPatchFloor("garbage", VITE_PATCH_FLOOR)).toBe(false)
    expect(
      satisfiesPatchFloor("2.14.2-canary.0", LAUNCH_EDITOR_PATCH_FLOOR)
    ).toBe(false)
  })
})

describe("installed vite (GHSA-587h-7wmj-h5pm, GHSA-698v-4r3x-3vcv, GHSA-r825-w8mm-5pxw)", () => {
  it("sits at or above the patch floor", () => {
    const version = installedViteVersion()
    expect(version, "vite not resolvable in the installed tree").not.toBeNull()
    expect(satisfiesPatchFloor(version ?? "", VITE_PATCH_FLOOR)).toBe(true)
  })

  it("carries a launch-editor at or above its patch floor", () => {
    const versions = launchEditorVersions()
    expect(
      versions,
      "no launch-editor copy found in the installed vite"
    ).not.toHaveLength(0)
    for (const version of versions) {
      expect(
        satisfiesPatchFloor(version, LAUNCH_EDITOR_PATCH_FLOOR),
        `launch-editor ${version}`
      ).toBe(true)
    }
  })
})

describe("package.json overrides", () => {
  it("pins vite to a range whose floor reaches the patch floor", () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), "package.json"), "utf8")
    ) as { overrides?: Record<string, string> }
    const range = manifest.overrides?.vite
    expect(range, "vite override missing from package.json").toBeDefined()
    const rangeFloor = (range ?? "").replace(/^[^0-9]*/, "")
    expect(satisfiesPatchFloor(rangeFloor, VITE_PATCH_FLOOR)).toBe(true)
  })
})
