import { describe, expect, it } from "vitest"

import {
  importeDe,
  lire,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../lib"
)

const ADAPTATEUR = "lib/purge-edge-cloudflare.ts"

function importateursDe(module: string): string[] {
  return SOURCES.filter(({ source }) => importeDe(source, module))
    .map(({ chemin }) => chemin)
    .sort()
}

describe("Purge de l'edge — frontière", () => {
  it("le port reste neutre", () => {
    const port = lire(import.meta.url, "./purge-edge.ts")

    for (const nom of [
      "server-only",
      "next/cache",
      "next/headers",
      "lib/db",
      "react",
      "lib/purge-edge-cloudflare",
    ]) {
      expect(importeDe(port, nom), nom).toBe(false)
    }
  })

  it("l'adaptateur Cloudflare n'est atteint que par l'invalidation du cache", () => {
    expect(importateursDe(ADAPTATEUR)).toEqual([
      "lib/use-cases/cache-invalidation.ts",
    ])
  })
})
