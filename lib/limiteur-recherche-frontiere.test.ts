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

const ACCES = "lib/acces-recherche.ts"
const ADAPTATEUR_REDIS = "lib/limiteur-recherche-redis.ts"

function importateursDe(module: string): string[] {
  return SOURCES.filter(({ source }) => importeDe(source, module))
    .map(({ chemin }) => chemin)
    .sort()
}

describe("Limiteur de Recherche — frontière", () => {
  it("le port reste neutre", () => {
    const port = lire(import.meta.url, "./limiteur-recherche.ts")

    for (const nom of ["server-only", "next/headers", "lib/redis", "react"]) {
      expect(importeDe(port, nom), nom).toBe(false)
    }
  })

  it("seules les deux surfaces publiques de la Recherche consomment le limiteur", () => {
    expect(importateursDe(ACCES)).toEqual([
      "app/(boutique)/recherche/page.tsx",
      "app/api/recherche/suggestions/route.ts",
    ])
  })

  it("l'adaptateur Redis n'est atteint que par l'accès à la Recherche", () => {
    expect(importateursDe(ADAPTATEUR_REDIS)).toEqual([ACCES])
  })
})
