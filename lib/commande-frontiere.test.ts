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

const NOMS_DECLARATION =
  /\bdeclarerApresEcriture(?:\s+as\s+([A-Za-z_$][\w$]*))?/g

const MACHINERIE_DECLARATION = new Set([
  "lib/apres-ecriture.ts",
  "lib/apres-ecriture-redeclaration.ts",
])

const MOUVEMENT_STOCK =
  /productVariant\.(?:update|updateMany)\s*\(\s*\{[\s\S]{0,400}?\b(?:stock\s*:|donneesVariante\s*\()/

const MOUVEMENT_ARITHMETIQUE =
  /productVariant\.(?:update|updateMany)\s*\(\s*\{[\s\S]{0,400}?\b(?:decrement|increment)\s*:/

const ECRITURE_SQL =
  /\$\s*(?:executeRaw|queryRaw)(?:Unsafe)?\s*(?:<[\s\S]*?>)?`([\s\S]*?)`/g

const CREATION_STOCK =
  /productVariant\.(?:create|createMany|createManyAndReturn)\s*\(\s*\{[\s\S]{0,400}?\bstock\s*:/

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

function nomsDeDeclaration(source: string): string[] {
  return [
    ...new Set(
      [...source.matchAll(NOMS_DECLARATION)].map(
        (match) => match[1] ?? "declarerApresEcriture"
      )
    ),
  ]
}

function appelsDeDeclaration(
  source: string
): { genreLitteral: string | null }[] {
  return nomsDeDeclaration(source).flatMap((nom) => {
    const motif = `\\b${nom}\\s*\\(\\s*`
    const litteraux = [
      ...source.matchAll(new RegExp(`${motif}(["'\`])([^"'\`]*)\\1`, "g")),
    ]
    const nonLitteraux = [
      ...source.matchAll(new RegExp(`${motif}(?!["'\`])`, "g")),
    ]
    return [
      ...litteraux.map((match) => ({ genreLitteral: match[2]! })),
      ...nonLitteraux.map(() => ({ genreLitteral: null })),
    ]
  })
}

function declarants(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(({ source }) =>
      appelsDeDeclaration(source).some(
        ({ genreLitteral }) => genreLitteral === GENRE_STOCK
      )
    )
    .map(({ chemin }) => chemin)
    .sort()
}

function declarationsSansGenreLitteral(
  sources: readonly SourceProduction[]
): string[] {
  return sources
    .filter(
      ({ chemin, source }) =>
        chemin !== PROPRIETAIRE &&
        !MACHINERIE_DECLARATION.has(chemin) &&
        appelsDeDeclaration(source).some(
          ({ genreLitteral }) => genreLitteral === null
        )
    )
    .map(({ chemin }) => chemin)
    .sort()
}

function ecritureSqlStock(source: string): boolean {
  return [...source.matchAll(ECRITURE_SQL)].some(
    ([, requete]) => /ProductVariant/i.test(requete!) && /stock/i.test(requete!)
  )
}

function ecrivainsDeMouvement(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(
      ({ source }) =>
        MOUVEMENT_STOCK.test(source) ||
        CREATION_STOCK.test(source) ||
        ecritureSqlStock(source)
    )
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
      ...declarationsSansGenreLitteral(sources),
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
    for (const [chemin, { signature }] of ECRITURES_IDENTITE) {
      expect(sourceDuDepot(chemin).source, chemin).toContain(signature)
    }
    for (const chemin of MACHINERIE_DECLARATION) {
      expect(sourceDuDepot(chemin).source, chemin).toContain(
        "declarerApresEcriture"
      )
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
      expect(
        appelsDeDeclaration(source).some(
          ({ genreLitteral }) => genreLitteral === GENRE_STOCK
        ),
        chemin
      ).toBe(false)
    }
  })

  it("les identités Variante permises portent leur raison dans les données", () => {
    const catalogue = sourceDuDepot(ECRIVAIN_CATALOGUE).source
    for (const [chemin, { genre }] of ECRITURES_IDENTITE) {
      expect(
        appelsDeDeclaration(sourceDuDepot(chemin).source).some(
          ({ genreLitteral }) => genreLitteral === GENRE_STOCK
        ),
        chemin
      ).toBe(false)
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

    const importAlias = sourceApres(
      reel,
      `import { declarerApresEcriture as declarer } from "@/lib/apres-ecriture"`
    )
    const declarationAliassee = sourceApres(
      importAlias,
      `const declarationAliassee = declarer("variante.stock.changee", { commandeId: "x" })`
    )
    const corpusAlias = avecSource(SOURCES, cible, declarationAliassee)
    expect(declarants(corpusAlias)).toEqual([PROPRIETAIRE, cible].sort())
    expect(infractions(corpusAlias)).toEqual([cible])

    const genreNonLitteral = sourceApres(
      reel,
      `const genreStock = "variante.stock.changee"\nconst declarationGeneree = declarerApresEcriture(genreStock, { commandeId: "x" })`
    )
    const corpusGenreNonLitteral = avecSource(SOURCES, cible, genreNonLitteral)
    expect(infractions(corpusGenreNonLitteral)).toEqual([cible])

    const ecritureSql = sourceApres(
      reel,
      `const ecritureSql = (tx: Prisma.TransactionClient) => tx.$executeRaw\`UPDATE "ProductVariant" SET "stock" = 0\``
    )
    const corpusSql = avecSource(SOURCES, cible, ecritureSql)
    expect(ecrivainsDeMouvement(corpusSql)).toEqual(
      [...ecrivainsDeMouvement(SOURCES), cible].sort()
    )
    expect(infractions(corpusSql)).toEqual([cible])

    const ecritureCreation = sourceApres(
      reel,
      `const ecritureCreation = (tx: Prisma.TransactionClient) => tx.productVariant.create({ data: { sku: "x", stock: 0 } })`
    )
    const corpusCreation = avecSource(SOURCES, cible, ecritureCreation)
    expect(ecrivainsDeMouvement(corpusCreation)).toEqual(
      [...ecrivainsDeMouvement(SOURCES), cible].sort()
    )
    expect(infractions(corpusCreation)).toEqual([cible])
  })

  it("seuls commande.ts et ponts.ts importent apres-ecriture/commande, et retours.ts n'importe pas orders.ts", () => {
    const importateurs = SOURCES.filter(({ source }) =>
      importeDe(source, "lib/use-cases/apres-ecriture/commande")
    )
      .map(({ chemin }) => chemin)
      .sort()
    expect(importateurs).toEqual([
      "lib/automations/ponts.ts",
      "lib/use-cases/commande.ts",
    ])
    expect(
      importeDe(
        sourceDuDepot("lib/use-cases/retours.ts").source,
        "lib/use-cases/orders"
      )
    ).toBe(false)
  })
})
