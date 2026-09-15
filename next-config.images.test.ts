import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"

import { beforeAll, describe, expect, it } from "vitest"

type RemotePattern = {
  protocol?: string
  port?: string
  hostname: string
  pathname?: string
  search?: string
}

const picomatch = createRequire(import.meta.url)(
  path.join(process.cwd(), "node_modules/next/dist/compiled/picomatch/index.js")
) as {
  makeRe: (pattern: string, options?: { dot?: boolean }) => RegExp
}

let remotePatterns: RemotePattern[] = []

function makeRe(pattern: string) {
  return picomatch.makeRe(pattern, { dot: true })
}

function matchRemotePattern(pattern: RemotePattern, url: URL): boolean {
  if (pattern.protocol !== undefined) {
    if (pattern.protocol.replace(/:$/, "") !== url.protocol.replace(/:$/, "")) {
      return false
    }
  }
  if (pattern.port !== undefined) {
    if (pattern.port !== url.port) {
      return false
    }
  }
  if (pattern.hostname === undefined) {
    throw new Error(
      `Pattern should define hostname but found\n${JSON.stringify(pattern)}`
    )
  } else {
    if (!makeRe(pattern.hostname).test(url.hostname)) {
      return false
    }
  }
  if (pattern.search !== undefined) {
    if (pattern.search !== url.search) {
      return false
    }
  }
  if (!makeRe(pattern.pathname ?? "**").test(url.pathname)) {
    return false
  }
  return true
}

function isAllowed(src: string): boolean {
  return remotePatterns.some((pattern) =>
    matchRemotePattern(pattern, new URL(src))
  )
}

beforeAll(async () => {
  globalThis.require = createRequire(import.meta.url)
  const { default: nextConfig } = await import("@/next.config")
  remotePatterns = (nextConfig.images?.remotePatterns ?? []) as RemotePattern[]
})

const seedSrcs = ["https://cdn.eguidar.com/products/iphone-15-pro.jpg"]

const hostileSrcs = [
  "https://evil.example.com/steal.png",
  "https://placehold.co/800x800?text=X",
  "https://placehold.co:8443/800x800?text=X",
  "https://placehold.co/900x900?text=X",
  "https://images.placehold.co/800x800?text=X",
  "https://placehold.co.evil.example.com/800x800?text=X",
  "https://cdn.eguidar.com/x.jpg?v=1",
]

describe("images.remotePatterns couvre les src du seed", () => {
  it("accepte chaque image référencée par prisma/seed.ts", () => {
    for (const src of seedSrcs) {
      expect(isAllowed(src), src).toBe(true)
    }
  })

  it("rejette les hôtes, ports, chemins et query strings non configurés", () => {
    for (const src of hostileSrcs) {
      expect(isAllowed(src), src).toBe(false)
    }
  })

  it("garde prisma/seed.ts exempt de placehold.co", () => {
    const seedSource = readFileSync(
      path.join(process.cwd(), "prisma/seed.ts"),
      "utf8"
    )
    expect(seedSource).not.toContain("placehold.co")
  })
})
