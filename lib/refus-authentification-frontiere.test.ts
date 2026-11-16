import { describe, expect, it } from "vitest"

import {
  atteignables,
  directive,
  importeDe,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE_NEUTRE = "lib/refus-authentification.ts"

const MODULES_INTERDITS = [
  "lib/db",
  "next/headers",
  "next/navigation",
  "next/cache",
  "next/server",
  "server-only",
  "react",
  "react-dom",
] as const

const SOURCES = sourcesDeProduction(import.meta.url, "../components", "./")
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))
const ATTEINTS = atteignables(MODULE_NEUTRE, PAR_CHEMIN)

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee
}

describe("Refus d'authentification — frontière client/serveur", () => {
  it("le module est neutre : ni directive, ni crochet, ni base", () => {
    const { source } = sourceDe(MODULE_NEUTRE)

    expect(directive(source)).toBeNull()
    expect(source).not.toMatch(/\buse[A-Z]\w*\(/)
    for (const nom of MODULES_INTERDITS) {
      expect(importeDe(source, nom), nom).toBe(false)
    }
  })

  it("son graphe de valeur n'atteint ni la base ni un module serveur, même par un voisin", () => {
    expect(ATTEINTS.size).toBeGreaterThan(1)
    expect(ATTEINTS.has("lib/auth-form-schemas.ts")).toBe(true)
    expect(ATTEINTS.has("lib/echecs-connexion-regles.ts")).toBe(true)
    expect(ATTEINTS.has("lib/db.ts")).toBe(false)
    expect(ATTEINTS.has("lib/echecs-connexion.ts")).toBe(false)

    for (const chemin of ATTEINTS) {
      const { source } = sourceDe(chemin)
      expect(directive(source), chemin).toBeNull()
      for (const nom of MODULES_INTERDITS) {
        expect(importeDe(source, nom), `${chemin} → ${nom}`).toBe(false)
      }
    }
  })

  it("les deux côtés de la frontière empruntent le module neutre", () => {
    const rendu = sourceDe("components/auth/auth-form-glue.ts").source
    const flux = sourceDe("components/auth/use-sign-in-flow.ts").source
    const reinitialisation = sourceDe(
      "components/auth/use-forgot-password-flow.ts"
    ).source
    const serveur = sourceDe("lib/echecs-connexion.ts").source

    for (const [chemin, source] of [
      ["components/auth/auth-form-glue.ts", rendu],
      ["components/auth/use-sign-in-flow.ts", flux],
      ["components/auth/use-forgot-password-flow.ts", reinitialisation],
      ["lib/echecs-connexion.ts", serveur],
    ] as const) {
      expect(importeDe(source, "refus-authentification"), chemin).toBe(true)
    }

    expect(directive(rendu)).toBe("use client")
    expect(importeDe(serveur, "server-only")).toBe(true)
  })
})
