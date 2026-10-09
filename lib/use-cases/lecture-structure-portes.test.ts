import { describe, expect, it } from "vitest"

import {
  avecSource,
  sourceDuCorpus,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"
import { MODULE_LECTURE, SYMBOLES } from "@/test/lecture-structure-outils"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../../app",
  "../../components",
  "../../lib",
  "../../prisma"
)

const PORTE_DE_LECTURE = /export\s+async\s+function\s+(lire[A-Za-z0-9_$]*)/g

function portesEmpruntees(source: string, portes: readonly string[]): string[] {
  return [
    ...source.matchAll(
      /import\s+(type\s+)?\{([^}]*)\}\s*from\s*["']@\/lib\/use-cases\/lecture-structure["']/g
    ),
  ]
    .flatMap(([, typeOnly, noms]) =>
      typeOnly
        ? []
        : (noms ?? "").split(",").map((nom) => nom.split(/\s+as\s+/)[0]!.trim())
    )
    .filter((nom) => portes.includes(nom))
}

function estUnePage(chemin: string): boolean {
  return chemin.startsWith("app/") && /\/page\.tsx$/.test(chemin)
}

function ecransDeDeuxPortes(
  sources: readonly { chemin: string; source: string }[],
  portes: readonly string[]
): { chemin: string; portes: string[] }[] {
  return sources
    .filter(({ chemin }) => estUnePage(chemin))
    .flatMap(({ chemin, source }) => {
      const emprustees = portesEmpruntees(source, portes)
      return emprustees.length > 1 ? [{ chemin, portes: emprustees }] : []
    })
}

describe("Lecture de la Structure — une porte par écran", () => {
  const source = sourceDuCorpus(SOURCES, MODULE_LECTURE).source
  const portes = [...source.matchAll(PORTE_DE_LECTURE)].map(([, nom]) => nom!)

  it("le module déclare ses portes de lecture, et la garde sait les lire", () => {
    expect(portes.length).toBeGreaterThanOrEqual(6)
    expect(new Set(portes).size).toBe(portes.length)
    for (const symbole of SYMBOLES) {
      if (symbole.startsWith("lire")) expect(portes, symbole).toContain(symbole)
    }
  })

  it("aucune page du dépôt n'appelle deux portes de lecture", () => {
    const pages = SOURCES.filter(({ chemin }) => estUnePage(chemin))
    expect(pages.length).toBeGreaterThan(10)

    const appelantes = pages
      .map(({ chemin, source }) => ({
        chemin,
        portes: portesEmpruntees(source, portes),
      }))
      .filter(({ portes }) => portes.length > 0)
    expect(appelantes.length).toBeGreaterThan(0)
    expect(appelantes.map(({ chemin }) => chemin)).toContain(
      "app/admin/categories/page.tsx"
    )
    expect(appelantes.flatMap(({ portes }) => portes).sort()).toContain(
      "lireEcranAdmin"
    )

    expect(ecransDeDeuxPortes(SOURCES, portes)).toEqual([])
  })

  it("la garde tombe sur un écran qui appelle deux portes, écrit dans un vrai fichier", () => {
    const PAGE = "app/admin/categories/page.tsx"
    const reel = sourceDuCorpus(SOURCES, PAGE).source
    expect(portesEmpruntees(reel, portes)).toEqual(["lireEcranAdmin"])

    const enViolation = reel.replace(
      'import { lireEcranAdmin } from "@/lib/use-cases/lecture-structure"',
      'import {\n  lireEcranAdmin,\n  lireOptionsSelecteur,\n} from "@/lib/use-cases/lecture-structure"'
    )
    expect(enViolation).not.toBe(reel)
    expect(
      ecransDeDeuxPortes(avecSource(SOURCES, PAGE, enViolation), portes)
    ).toEqual([
      {
        chemin: PAGE,
        portes: ["lireEcranAdmin", "lireOptionsSelecteur"],
      },
    ])

    expect(ecransDeDeuxPortes(avecSource(SOURCES, PAGE, reel), portes)).toEqual(
      []
    )

    const enType = reel.replace(
      "import { lireEcranAdmin }",
      'import type { CiblesSuppression } from "@/lib/use-cases/lecture-structure"\nimport { lireEcranAdmin }'
    )
    expect(portesEmpruntees(enType, portes)).toEqual(["lireEcranAdmin"])
  })
})
