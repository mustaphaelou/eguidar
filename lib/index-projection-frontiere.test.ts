import { describe, expect, it } from "vitest"

import {
  directive,
  importeDe,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const PROPRIETAIRE = "lib/index-projection.ts"

const VALEUR_RESERVEE = "_sans-structure"
const LIBELLE_RESERVE = "Sans Structure"

const SLUG_RESERVE = "SLUG_SANS_STRUCTURE"
const LIBELLE_RESERVE_NOMME = "LIBELLE_SANS_STRUCTURE"

const PRODUCTEURS_NOMMES = new Map<
  string,
  { raison: string; noms: readonly string[] }
>([
  [
    PROPRIETAIRE,
    {
      raison: "la voie d'écriture du Document d'index",
      noms: [SLUG_RESERVE, LIBELLE_RESERVE_NOMME],
    },
  ],
  [
    "lib/use-cases/search.ts",
    {
      raison:
        "la nomenclature de la Recherche : la puce se lit et filtre vraiment",
      noms: [SLUG_RESERVE, LIBELLE_RESERVE_NOMME],
    },
  ],
  [
    "lib/use-cases/admin-catalog.ts",
    {
      raison:
        "la puce de l'Administration : deux libellés pour un seul fait divergeraient",
      noms: [LIBELLE_RESERVE_NOMME],
    },
  ],
  [
    "components/storefront/search-suggestions.tsx",
    {
      raison:
        "la suggestion du Bandeau : la valeur ne mène pas à une page de catégorie",
      noms: [SLUG_RESERVE],
    },
  ],
])

const SITES_EMPRUNTES = [
  "lib/use-cases/search.ts",
  "lib/use-cases/admin-catalog.ts",
  "components/storefront/search-suggestions.tsx",
]

const VOIES_D_ECRITURE = new Map<string, string>([
  [
    "lib/use-cases/admin-structure.ts",
    "l'écriture de l'index après une mutation de Structure",
  ],
  [
    "lib/use-cases/admin-catalog.ts",
    "l'écriture de l'index après une mutation de Produit",
  ],
  ["prisma/seed.ts", "l'écriture de l'index par l'outillage d'exploitation"],
])

const PROJECTION = "toIndexableProduct"

const NOM_RESERVE = /\b(?:SLUG|LIBELLE)_SANS_STRUCTURE\b/g

const DECLARATION_RESERVEE =
  /\b(?:export\s+)?(?:const|let|var)\s+(SLUG_SANS_STRUCTURE|LIBELLE_SANS_STRUCTURE)\b/g

const CLAUSE_IMPORT = /\bimport\s+[^;]*?\bfrom\s*(["'])[^"']+\1/g

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../lib",
  "../prisma"
)

function sourceDuDepot(chemin: string): SourceProduction {
  const trouvee = SOURCES.find(({ chemin: nominee }) => nominee === chemin)
  if (!trouvee) throw new Error(`Source absente du dépôt : ${chemin}`)
  return trouvee
}

function avecSource(chemin: string, source: string): SourceProduction[] {
  return SOURCES.map((entree) =>
    entree.chemin === chemin ? { chemin, source } : entree
  )
}

function sourceApres(source: string, ligne: string): string {
  const premiere = source.split("\n")[0]!
  return `${premiere}\n${ligne}\n${source.slice(premiere.length)}`
}

function occurrences(source: string, valeur: string): number {
  return source.split(valeur).length - 1
}

function nomsReserves(source: string): string[] {
  return [...source.matchAll(NOM_RESERVE)].map(([nom]) => nom!)
}

function horsDesImports(source: string, nom: string): number {
  return occurrences(source.replace(CLAUSE_IMPORT, "\n"), nom)
}

function ecrivains(
  sources: readonly SourceProduction[],
  valeur: string
): string[] {
  return sources
    .filter(({ source }) => source.includes(valeur))
    .map(({ chemin }) => chemin)
    .sort()
}

function declarations(
  sources: readonly SourceProduction[]
): { chemin: string; nom: string }[] {
  return sources
    .flatMap(({ chemin, source }) =>
      [...source.matchAll(DECLARATION_RESERVEE)].map(([, nom]) => ({
        chemin,
        nom: nom!,
      }))
    )
    .sort(
      (a, b) => a.chemin.localeCompare(b.chemin) || a.nom.localeCompare(b.nom)
    )
}

function producteurs(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(({ source }) => nomsReserves(source).length > 0)
    .map(({ chemin }) => chemin)
    .sort()
}

function sansProprietaire(sources: readonly SourceProduction[]): string[] {
  return producteurs(sources).filter(
    (chemin) =>
      !importeDe(sourceDuCorpus(sources, chemin).source, "lib/index-projection")
  )
}

function atteintLaProjection(source: string): boolean {
  return (
    importeDe(source, "lib/index-projection") &&
    horsDesImports(source, PROJECTION) > 0
  )
}

describe("Valeur réservée de la facette — un propriétaire, prouvé", () => {
  it("le corpus est non vacuant, et il porte les quatre producteurs nommés", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        ...PRODUCTEURS_NOMMES.keys(),
        ...VOIES_D_ECRITURE.keys(),
        "app/(boutique)/page.tsx",
      ])
    )
    for (const [chemin, { noms }] of PRODUCTEURS_NOMMES) {
      const { source } = sourceDuDepot(chemin)
      for (const nom of noms) {
        expect(occurrences(source, nom), `${chemin} → ${nom}`).toBeGreaterThan(
          0
        )
      }
    }
  })

  it("la valeur réservée et son libellé sont écrits une fois, dans le propriétaire", () => {
    const { source } = sourceDuDepot(PROPRIETAIRE)

    expect(ecrivains(SOURCES, VALEUR_RESERVEE)).toEqual([PROPRIETAIRE])
    expect(ecrivains(SOURCES, LIBELLE_RESERVE)).toEqual([PROPRIETAIRE])

    expect(occurrences(source, VALEUR_RESERVEE)).toBe(1)
    expect(occurrences(source, LIBELLE_RESERVE)).toBe(1)

    expect(source).toMatch(
      /^export const SLUG_SANS_STRUCTURE = "_sans-structure"$/m
    )
    expect(source).toMatch(
      /^export const LIBELLE_SANS_STRUCTURE = "Sans Structure"$/m
    )
  })

  it("chacun des deux noms se déclare une fois, et dans le propriétaire", () => {
    expect(declarations(SOURCES)).toEqual([
      { chemin: PROPRIETAIRE, nom: LIBELLE_RESERVE_NOMME },
      { chemin: PROPRIETAIRE, nom: SLUG_RESERVE },
    ])
  })

  it("tout site qui produit la valeur, hors le propriétaire, l'emprunte au propriétaire", () => {
    expect(producteurs(SOURCES)).toEqual([...PRODUCTEURS_NOMMES.keys()].sort())

    for (const [chemin, { noms }] of PRODUCTEURS_NOMMES) {
      const { source } = sourceDuDepot(chemin)
      expect(new Set(nomsReserves(source)), chemin).toEqual(new Set(noms))
      for (const nom of noms) {
        expect(
          horsDesImports(source, nom),
          `${chemin} → ${nom}`
        ).toBeGreaterThan(0)
      }
    }

    for (const chemin of SITES_EMPRUNTES) {
      expect(
        importeDe(sourceDuDepot(chemin).source, "lib/index-projection"),
        chemin
      ).toBe(true)
    }
    expect(sansProprietaire(SOURCES)).toEqual([PROPRIETAIRE])
  })

  it("toute voie d'écriture du Document d'index atteint le propriétaire", () => {
    expect(VOIES_D_ECRITURE.size).toBeGreaterThan(0)

    for (const chemin of VOIES_D_ECRITURE.keys()) {
      const { source } = sourceDuDepot(chemin)
      expect(importeDe(source, "lib/index-projection"), chemin).toBe(true)
      expect(atteintLaProjection(source), chemin).toBe(true)
    }
    expect(
      [...VOIES_D_ECRITURE.keys()].filter(
        (chemin) => !atteintLaProjection(sourceDuDepot(chemin).source)
      )
    ).toEqual([])
  })

  it("le propriétaire est neutre, pour que la valeur traverse la couture", () => {
    const { source } = sourceDuDepot(PROPRIETAIRE)

    expect(directive(source)).toBeNull()
    for (const interdit of [
      "lib/db",
      "lib/meili",
      "meilisearch",
      "next/headers",
      "server-only",
    ]) {
      expect(importeDe(source, interdit), interdit).toBe(false)
    }

    const clients = SOURCES.filter(
      ({ source }) => directive(source) === "use client"
    )
    expect(clients.length).toBeGreaterThan(0)
    expect(clients.map(({ chemin }) => chemin)).toContain(
      "components/storefront/search-suggestions.tsx"
    )
  })

  it("la garde tombe sur une seconde écriture de la valeur, dans un fichier réel", () => {
    const cible = "lib/use-cases/search.ts"
    const reel = sourceDuDepot(cible).source

    expect(ecrivains(SOURCES, VALEUR_RESERVEE)).toEqual([PROPRIETAIRE])

    const enViolation = sourceApres(
      reel,
      'const SLUG_DE_REPLI = "_sans-structure"'
    )
    expect(enViolation).not.toBe(reel)

    const ecrivainsEnViolation = ecrivains(
      avecSource(cible, enViolation),
      VALEUR_RESERVEE
    )
    expect(ecrivainsEnViolation).toEqual(
      expect.arrayContaining([PROPRIETAIRE, cible])
    )
    expect(ecrivainsEnViolation).toHaveLength(2)
  })

  it("la garde tombe sur une seconde écriture du libellé, dans un fichier réel", () => {
    const cible = "lib/use-cases/admin-catalog.ts"
    const reel = sourceDuDepot(cible).source

    expect(ecrivains(SOURCES, LIBELLE_RESERVE)).toEqual([PROPRIETAIRE])

    const enViolation = sourceApres(reel, 'const ETIQUETTE = "Sans Structure"')
    expect(enViolation).not.toBe(reel)

    const ecrivainsEnViolation = ecrivains(
      avecSource(cible, enViolation),
      LIBELLE_RESERVE
    )
    expect(ecrivainsEnViolation).toEqual(
      expect.arrayContaining([PROPRIETAIRE, cible])
    )
    expect(ecrivainsEnViolation).toHaveLength(2)
  })

  it("la garde tombe sur une seconde déclaration du nom, dans un fichier réel", () => {
    const cible = "lib/use-cases/storefront.ts"
    const reel = sourceDuDepot(cible).source

    const enViolation = sourceApres(
      reel,
      'export const SLUG_SANS_STRUCTURE = "sans-structure"'
    )
    expect(enViolation).not.toBe(reel)

    expect(declarations(avecSource(cible, enViolation))).toEqual([
      { chemin: PROPRIETAIRE, nom: LIBELLE_RESERVE_NOMME },
      { chemin: PROPRIETAIRE, nom: SLUG_RESERVE },
      { chemin: cible, nom: SLUG_RESERVE },
    ])
  })

  it("la garde tombe sur un producteur que personne n'a nommé", () => {
    const cible = "lib/use-cases/storefront.ts"
    const reel = sourceDuDepot(cible).source

    expect(producteurs(SOURCES)).not.toContain(cible)

    const enViolation = sourceApres(
      reel,
      `import { ${SLUG_RESERVE} } from "@/lib/index-projection"\n\nconst FILTRE = ${SLUG_RESERVE}`
    )
    expect(enViolation).not.toBe(reel)
    expect(horsDesImports(enViolation, SLUG_RESERVE)).toBeGreaterThan(0)

    const producteursEnViolation = producteurs(avecSource(cible, enViolation))
    expect(producteursEnViolation).toEqual(
      expect.arrayContaining([...PRODUCTEURS_NOMMES.keys(), cible])
    )
    expect(producteursEnViolation).toHaveLength(PRODUCTEURS_NOMMES.size + 1)
  })

  it("la garde voit un site qui nomme la valeur sans atteindre le propriétaire", () => {
    const cible = "lib/use-cases/storefront.ts"
    const reel = sourceDuDepot(cible).source

    const enViolation = sourceApres(reel, `const FILTRE = ${SLUG_RESERVE}`)
    expect(enViolation).not.toBe(reel)

    const corpus = avecSource(cible, enViolation)
    expect(producteurs(corpus)).not.toEqual(
      [...PRODUCTEURS_NOMMES.keys()].sort()
    )
    expect(producteurs(corpus)).toContain(cible)
    expect(sansProprietaire(corpus)).toEqual([PROPRIETAIRE, cible])
  })

  it("la garde tombe sur une voie d'écriture qui re-dérive la valeur, dans un fichier réel", () => {
    const cible = "prisma/seed.ts"
    const reel = sourceDuDepot(cible).source

    expect(atteintLaProjection(reel)).toBe(true)

    const enViolation = reel.replace(
      'import { toIndexableProduct } from "../lib/index-projection"',
      'const toIndexableProduct = (p: { category: { slug: string } | null }) => ({\n  categorySlug: p.category?.slug ?? "_sans-structure",\n})'
    )
    expect(enViolation).not.toBe(reel)

    expect(atteintLaProjection(enViolation)).toBe(false)
    expect(ecrivains(avecSource(cible, enViolation), VALEUR_RESERVEE)).toEqual(
      expect.arrayContaining([PROPRIETAIRE, cible])
    )
  })
})
