import { readFileSync, readdirSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { respecteLePlancher, versionInstallee } from "./plancher-de-correctif"

const LAUNCH_EDITOR_PATCH_FLOOR = "2.14.2"

const LAUNCH_EDITOR_VERSION = /launch-editor@(\d+\.\d+\.\d+)/g

function javascriptFilesUnder(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return javascriptFilesUnder(entryPath)
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : []
  })
}

function launchEditorVersions(): string[] {
  const installee = versionInstallee("launch-editor")
  if (installee !== null) return [installee]

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

describe("the copy of launch-editor borne by vite", () => {
  it("carries a launch-editor at or above its patch floor", () => {
    const versions = launchEditorVersions()
    expect(
      versions,
      "no launch-editor copy found in the installed vite"
    ).not.toHaveLength(0)
    for (const version of versions) {
      expect(
        respecteLePlancher(version, LAUNCH_EDITOR_PATCH_FLOOR),
        `launch-editor ${version}`
      ).toBe(true)
    }
  })
})
