import { describe, expect, it } from "vitest"

import {
  atteignables,
  carte,
  directive,
  empruntsDeValeur,
  importeDe,
  sourceApres,
  sourceDuCorpus,
  sourcesDeProduction,
  avecSource,
} from "@/lib/use-cases/outils-frontiere"
import { MODULE_LECTURE, SYMBOLES } from "@/test/lecture-structure-outils"

const COEUR = "lib/marche-structure.ts"
const BASE = "lib/db.ts"
const AIDE_FRONTIERE = "lib/use-cases/outils-frontiere.ts"

const CLIENT_TEMOIN = "components/admin/delete-category-button.tsx"

const CHEMINS_INTERDITS = [
  "lib/use-cases/storefront.ts",
  "lib/use-cases/admin-structure.ts",
  "lib/use-cases/admin-catalog.ts",
  "lib/use-cases/search.ts",
  "lib/use-cases/admin-dashboard.ts",
] as const

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)
const PAR_CHEMIN = carte(SOURCES)
const ATTEINTS = atteignables(MODULE_LECTURE, PAR_CHEMIN)

const MODULES_CLIENTS = SOURCES.filter(
  ({ source }) => directive(source) === "use client"
)

function sourceDe(chemin: string): string {
  return sourceDuCorpus(SOURCES, chemin).source
}

describe("Lecture de la Structure — le module n'atteint aucun module client", () => {
  it("le module lit la base et le cœur, et n'atteint aucune surface", () => {
    const source = sourceDe(MODULE_LECTURE)

    for (const symbole of SYMBOLES) {
      expect(source, symbole).toContain(symbole)
    }

    expect(directive(source)).toBeNull()

    expect(PAR_CHEMIN.has(MODULE_LECTURE)).toBe(true)
    expect(ATTEINTS.has(MODULE_LECTURE)).toBe(true)
    expect(ATTEINTS.has(BASE), BASE).toBe(true)
    expect(ATTEINTS.has(COEUR), COEUR).toBe(true)

    for (const chemin of CHEMINS_INTERDITS) {
      expect(ATTEINTS.has(chemin), chemin).toBe(false)
    }

    for (const chemin of ATTEINTS) {
      const atteinte = sourceDe(chemin)
      expect(directive(atteinte), chemin).not.toBe("use client")
      expect(directive(atteinte), chemin).not.toBe("use server")
    }
  })

  it("aucun module client du dépôt n'atteint la Lecture", () => {
    expect(MODULES_CLIENTS.length).toBeGreaterThan(0)
    expect(MODULES_CLIENTS.map(({ chemin }) => chemin)).toContain(CLIENT_TEMOIN)
    for (const { chemin } of MODULES_CLIENTS) {
      expect(
        atteignables(chemin, PAR_CHEMIN).has(MODULE_LECTURE),
        `${chemin} → ${MODULE_LECTURE}`
      ).toBe(false)
    }
  })

  it("le balayage des clients repose sur une aide qui se prouve elle-même", () => {
    expect(MODULES_CLIENTS.length).toBeGreaterThan(0)
    expect(directive(sourceDe(CLIENT_TEMOIN))).toBe("use client")
  })

  it("le parcours est non vacuant : les quatre arbres sont visités, et la page trouve la Lecture", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "app/(boutique)/page.tsx",
        "app/admin/categories/page.tsx",
        "app/admin/produits/[id]/page.tsx",
        CLIENT_TEMOIN,
        MODULE_LECTURE,
        "prisma/seed.ts",
      ])
    )
    expect(
      atteignables("app/admin/produits/[id]/page.tsx", PAR_CHEMIN).has(
        MODULE_LECTURE
      )
    ).toBe(true)
    expect(ATTEINTS.has(AIDE_FRONTIERE)).toBe(false)
  })

  it("la garde tombe sur une violation synthétique, écrite dans un fichier réel", () => {
    const reel = sourceDe(MODULE_LECTURE)
    const enViolation = sourceApres(
      reel,
      'import { DeleteCategoryButton } from "@/components/admin/delete-category-button"'
    )
    expect(enViolation).not.toBe(reel)

    const carteEnViolation = carte(
      avecSource(SOURCES, MODULE_LECTURE, enViolation)
    )
    expect(
      empruntsDeValeur(MODULE_LECTURE, enViolation, carteEnViolation).map(
        ({ chemin }) => chemin
      )
    ).toContain(CLIENT_TEMOIN)

    const atteintsEnViolation = atteignables(MODULE_LECTURE, carteEnViolation)
    expect(atteintsEnViolation.has(CLIENT_TEMOIN)).toBe(true)
    expect(
      [...atteintsEnViolation].filter(
        (chemin) => directive(sourceDe(chemin)) === "use client"
      )
    ).not.toEqual([])

    const enType = sourceApres(
      reel,
      'import type { DeleteCategoryButtonProps } from "@/components/admin/delete-category-button"'
    )
    expect(importeDe(enType, "components/admin/delete-category-button")).toBe(
      true
    )
    expect(
      atteignables(
        MODULE_LECTURE,
        carte(avecSource(SOURCES, MODULE_LECTURE, enType))
      ).has(CLIENT_TEMOIN)
    ).toBe(false)

    const clientEnViolation = sourceApres(
      sourceDe(CLIENT_TEMOIN),
      'import { lireEcranAdmin } from "@/lib/use-cases/lecture-structure"'
    )
    expect(directive(clientEnViolation)).toBe("use client")
    expect(
      atteignables(
        CLIENT_TEMOIN,
        carte(avecSource(SOURCES, CLIENT_TEMOIN, clientEnViolation))
      ).has(MODULE_LECTURE)
    ).toBe(true)
  })
})
