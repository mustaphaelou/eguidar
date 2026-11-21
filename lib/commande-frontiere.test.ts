import { describe, expect, it } from "vitest"

import {
  avecSource,
  carte,
  importeDe,
  sourceApres,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const PROPRIETAIRE = "lib/use-cases/commande.ts"

const GENRE_STOCK = "variante.stock.changee"
const ECRIVAIN_CATALOGUE = "lib/use-cases/admin-catalog.ts"
const ECRIVAIN_IMPORT = "lib/use-cases/import-produits.ts"

const DECLARATION_STOCK =
  /\bdeclarerApresEcriture\s*\(\s*["']variante\.stock\.changee["']/

const MOUVEMENT_STOCK =
  /productVariant\.(?:update|updateMany)\s*\(\s*\{[\s\S]{0,400}?\b(?:stock\s*:|donneesVariante\s*\()/

const MOUVEMENT_ARITHMETIQUE =
  /productVariant\.(?:update|updateMany)\s*\(\s*\{[\s\S]{0,400}?\b(?:decrement|increment)\s*:/

const APPELANTS = [
  ECRIVAIN_CATALOGUE,
  "lib/use-cases/orders.ts",
  "lib/use-cases/retours.ts",
]

const ECRITURES_IDENTITE = new Map<
  string,
  { raison: string; signature: string; genre: string }
>([
  [
    ECRIVAIN_CATALOGUE,
    {
      raison:
        "le formulaire Produit écrit le stock comme champ d'identité de la Variante, et déclare produit.enregistre qui réindexe et invalide déjà",
      signature: "data: donneesVariante(variant)",
      genre: "produit.enregistre",
    },
  ],
  [
    ECRIVAIN_IMPORT,
    {
      raison:
        "le Lot d'import écrit le stock comme champ d'identité de la Variante, et déclare produit.enregistre.lot qui réindexe et invalide déjà",
      signature: "stock: variante.stock",
      genre: "produit.enregistre.lot",
    },
  ],
])

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../lib",
  "../prisma"
)

const PAR_CHEMIN = carte(SOURCES)

function sourceDuDepot(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source absente du dépôt : ${chemin}`)
  return trouvee
}

function occurrences(source: string, valeur: string): number {
  return source.split(valeur).length - 1
}

function declarants(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(({ source }) => DECLARATION_STOCK.test(source))
    .map(({ chemin }) => chemin)
    .sort()
}

function ecrivainsDeMouvement(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(({ source }) => MOUVEMENT_STOCK.test(source))
    .map(({ chemin }) => chemin)
    .sort()
}

function infractions(sources: readonly SourceProduction[]): string[] {
  const arithmetiques = sources
    .filter(({ source }) => MOUVEMENT_ARITHMETIQUE.test(source))
    .map(({ chemin }) => chemin)
    .filter((chemin) => chemin !== PROPRIETAIRE)

  return [
    ...new Set([
      ...declarants(sources).filter((chemin) => chemin !== PROPRIETAIRE),
      ...ecrivainsDeMouvement(sources).filter(
        (chemin) => chemin !== PROPRIETAIRE && !ECRITURES_IDENTITE.has(chemin)
      ),
      ...arithmetiques,
    ]),
  ].sort()
}

describe("Commande — frontière de la déclaration de stock", () => {
  it("le corpus porte le propriétaire, les appelants et les écritures nommées", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect([...PAR_CHEMIN.keys()]).toEqual(
      expect.arrayContaining([
        PROPRIETAIRE,
        ...APPELANTS,
        ...ECRITURES_IDENTITE.keys(),
      ])
    )
    for (const [chemin, { raison, signature }] of ECRITURES_IDENTITE) {
      expect(raison.length, chemin).toBeGreaterThan(0)
      expect(sourceDuDepot(chemin).source, chemin).toContain(signature)
    }
  })

  it("la déclaration du genre de stock n'appartient qu'à la tranche Commande", () => {
    expect(declarants(SOURCES)).toEqual([PROPRIETAIRE])

    const source = sourceDuDepot(PROPRIETAIRE).source
    expect(occurrences(source, `"${GENRE_STOCK}"`)).toBe(1)
    for (const mouvement of [
      "stock: { decrement: mouvement.quantité }",
      "stock: { increment: mouvement.quantité }",
      "stock: mouvement.stock",
    ]) {
      expect(source, mouvement).toContain(mouvement)
    }
  })

  it("les écritures de mouvement ne sortent pas de la tranche", () => {
    expect(ecrivainsDeMouvement(SOURCES)).toEqual(
      [PROPRIETAIRE, ECRIVAIN_CATALOGUE].sort()
    )
    expect(infractions(SOURCES)).toEqual([])
  })

  it("les appelants atteignent la tranche sans déclarer le genre", () => {
    for (const chemin of APPELANTS) {
      const source = sourceDuDepot(chemin).source
      expect(importeDe(source, "lib/use-cases/commande"), chemin).toBe(true)
      expect(/écrireLeStock|exécuterStock/.test(source), chemin).toBe(true)
      expect(DECLARATION_STOCK.test(source), chemin).toBe(false)
    }
  })

  it("les identités Variante permises portent leur raison dans les données", () => {
    const catalogue = sourceDuDepot(ECRIVAIN_CATALOGUE).source
    for (const [chemin, { raison, genre }] of ECRITURES_IDENTITE) {
      expect(raison.length, chemin).toBeGreaterThan(0)
      expect(DECLARATION_STOCK.test(sourceDuDepot(chemin).source), chemin).toBe(
        false
      )
      expect(catalogue, genre).toContain(`"${genre}"`)
    }
    expect(
      importeDe(
        sourceDuDepot(ECRIVAIN_IMPORT).source,
        "lib/use-cases/admin-catalog"
      )
    ).toBe(true)
  })

  it("la garde tombe sur une violation synthétique", () => {
    const cible = "lib/use-cases/orders.ts"
    const reel = sourceDuDepot(cible).source
    expect(infractions(SOURCES)).toEqual([])

    const enViolation = sourceApres(
      sourceApres(
        reel,
        `const declarationInterdite = declarerApresEcriture("variante.stock.changee", { produitId: "x", slug: "x", categoryId: null })`
      ),
      "const ecritureInterdite = (tx: Prisma.TransactionClient) => tx.productVariant.updateMany({ where: { id: 'x' }, data: { stock: { decrement: 1 } } })"
    )
    expect(enViolation).not.toBe(reel)

    const corpus = avecSource(SOURCES, cible, enViolation)
    expect(declarants(corpus)).toEqual([PROPRIETAIRE, cible].sort())
    expect(ecrivainsDeMouvement(corpus)).toEqual(
      [...ecrivainsDeMouvement(SOURCES), cible].sort()
    )
    expect(infractions(corpus)).toEqual([cible])

    const catalogueEnViolation = sourceApres(
      sourceDuDepot(ECRIVAIN_CATALOGUE).source,
      "const ecritureInterdite = (tx: Prisma.TransactionClient) => tx.productVariant.updateMany({ where: { id: 'x' }, data: { stock: { increment: 1 } } })"
    )
    expect(
      infractions(avecSource(SOURCES, ECRIVAIN_CATALOGUE, catalogueEnViolation))
    ).toEqual([ECRIVAIN_CATALOGUE])
  })
})
