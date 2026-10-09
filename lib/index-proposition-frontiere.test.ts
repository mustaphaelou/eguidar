import { describe, expect, it } from "vitest"

import {
  directive,
  empruntsDeValeur,
  importeDe,
  lire,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE_DE_LA_VALEUR = "lib/index-projection.ts"
const SPECIFIEUR = "@/lib/index-projection"
const VALEUR_RESERVEE = "SLUG_SANS_STRUCTURE"
const SUGGESTIONS = "components/storefront/search-suggestions.tsx"
const FILTRES = "components/storefront/search-filters.tsx"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../lib"
)
const PAR_CHEMIN = new Map(
  SOURCES.map(({ chemin, source }) => [chemin, { chemin, source }])
)

const EMPRUNT_NOMME = new RegExp(
  `\\bimport\\s+(?!type\\b)\\{[^}]*\\b${VALEUR_RESERVEE}\\b[^}]*\\}\\s*from\\s*["'][^"']+["']`
)

const COMPARAISON_A_LA_VALEUR = new RegExp(
  [
    `\\bcase\\s+${VALEUR_RESERVEE}\\b`,
    `\\b${VALEUR_RESERVEE}\\b\\s*(?:===|!==|==|!=)`,
    `(?:===|!==|==|!=)\\s*\\b${VALEUR_RESERVEE}\\b`,
  ].join("|"),
  "g"
)

const DESTINATION = /(["'`])(\/[A-Za-z][^"'`]*)\1/g

const NAVIGATION_NOMMEE = new Map<string, string[]>([
  [SUGGESTIONS, ["/produits", "/categorie/${slug}"]],
])

const LIEN_PLANTE = [
  `import { ${VALEUR_RESERVEE} } from "${SPECIFIEUR}"`,
  "",
  "export function hrefDeFacette(slug: string): string {",
  "  return slug === SLUG_SANS_STRUCTURE",
  '    ? "/produits"',
  "    : `/categorie/${slug}`",
  "}",
].join("\n")

const LIBELLE_SEUL = [
  `import { LIBELLE_SANS_STRUCTURE, ${VALEUR_RESERVEE} } from "${SPECIFIEUR}"`,
  "",
  "export function libelleDeFacette(slug: string): string {",
  "  return slug === SLUG_SANS_STRUCTURE ? LIBELLE_SANS_STRUCTURE : slug",
  "}",
].join("\n")

const VALEUR_RECUE = [
  `import { ${VALEUR_RESERVEE} } from "${SPECIFIEUR}"`,
  "",
  "export function valeurReservee(): string {",
  "  return SLUG_SANS_STRUCTURE",
  "}",
].join("\n")

const COMPARAISONS: [string, string[]][] = [
  [
    "const href = slug === SLUG_SANS_STRUCTURE ? '/produits' : '/categorie'",
    ["/produits", "/categorie"],
  ],
  [
    "const href = SLUG_SANS_STRUCTURE === slug ? '/produits' : '/categorie'",
    ["/produits", "/categorie"],
  ],
  [
    "const href = slug == SLUG_SANS_STRUCTURE ? '/produits' : '/categorie'",
    ["/produits", "/categorie"],
  ],
  [
    "const href = slug !== SLUG_SANS_STRUCTURE ? '/categorie' : '/produits'",
    ["/categorie", "/produits"],
  ],
  [
    "const href = slug != SLUG_SANS_STRUCTURE ? '/categorie' : '/produits'",
    ["/categorie", "/produits"],
  ],
]

function sourceDe(chemin: string): SourceProduction {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee
}

function emprunteLaValeur(
  chemin: string,
  source: string,
  parChemin: ReadonlyMap<string, SourceProduction>
): boolean {
  return (
    empruntsDeValeur(chemin, source, parChemin).some(
      ({ chemin: cible }) => cible === MODULE_DE_LA_VALEUR
    ) && EMPRUNT_NOMME.test(source)
  )
}

function fenetre(source: string, depuis: number): string {
  const suite = source.slice(depuis)
  const fin = suite.search(/;|\n[}\]]/)
  return fin === -1 ? suite : suite.slice(0, fin)
}

function destinationsDepuis(source: string): string[] {
  const trouvees: string[] = []
  for (const trouve of source.matchAll(COMPARAISON_A_LA_VALEUR)) {
    for (const [, , destination] of fenetre(source, trouve.index ?? 0).matchAll(
      DESTINATION
    )) {
      if (destination !== undefined && !trouvees.includes(destination)) {
        trouvees.push(destination)
      }
    }
  }
  return trouvees
}

function navigations(
  sources: readonly SourceProduction[]
): Map<string, string[]> {
  const trouvees = new Map<string, string[]>()
  for (const { chemin, source } of sources) {
    if (directive(source) !== "use client") continue
    if (!emprunteLaValeur(chemin, source, PAR_CHEMIN)) continue
    const destinations = destinationsDepuis(source)
    if (destinations.length > 0) trouvees.set(chemin, destinations)
  }
  return new Map([...trouvees].sort(([a], [b]) => a.localeCompare(b)))
}

function sourceApres(source: string, ligne: string): string {
  const premiere = source.split("\n")[0]!
  return `${premiere}\n${ligne}\n${source.slice(premiere.length)}`
}

function avecSource(chemin: string, source: string): SourceProduction[] {
  return SOURCES.map((entree) =>
    entree.chemin === chemin ? { chemin, source } : entree
  )
}

describe("Valeur réservée — le lien qu'un module client en décide", () => {
  it("la suggestion de Structure est le seul lien du dépôt décidé depuis la valeur", () => {
    expect([...navigations(SOURCES)]).toEqual([...NAVIGATION_NOMMEE])
  })

  it("la garde nomme la destination, et pas seulement le fichier", () => {
    expect(navigations(SOURCES).get(SUGGESTIONS)).toEqual([
      "/produits",
      "/categorie/${slug}",
    ])
  })

  it("le parcours est non vacant : la valeur traverse, et son receveur est un vrai module client", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([SUGGESTIONS, MODULE_DE_LA_VALEUR])
    )

    const suggestions = sourceDe(SUGGESTIONS)
    expect(directive(suggestions.source)).toBe("use client")
    expect(directive(lire(import.meta.url, "./index-projection.ts"))).toBeNull()
    expect(emprunteLaValeur(SUGGESTIONS, suggestions.source, PAR_CHEMIN)).toBe(
      true
    )
    expect(
      empruntsDeValeur(SUGGESTIONS, suggestions.source, PAR_CHEMIN).map(
        ({ chemin }) => chemin
      )
    ).toContain(MODULE_DE_LA_VALEUR)
    expect(directive(sourceDe(FILTRES).source)).toBe("use client")
  })
})

describe("Valeur réservée — ce que la frontière autorise encore", () => {
  it("laisse franchir la valeur vers un module client, et n'y voit aucun lien", () => {
    const replante = avecSource(
      FILTRES,
      sourceApres(sourceDe(FILTRES).source, VALEUR_RECUE)
    )
    const plante = replante.find(({ chemin }) => chemin === FILTRES)!

    expect(emprunteLaValeur(FILTRES, plante.source, PAR_CHEMIN)).toBe(true)
    expect(
      empruntsDeValeur(FILTRES, plante.source, PAR_CHEMIN).map(
        ({ chemin }) => chemin
      )
    ).toContain(MODULE_DE_LA_VALEUR)
    expect(destinationsDepuis(plante.source)).toEqual([])
    expect([...navigations(replante)]).toEqual([...NAVIGATION_NOMMEE])
  })

  it("ne confond pas une comparaison qui ne mène nulle part avec un lien", () => {
    const replante = avecSource(
      FILTRES,
      sourceApres(sourceDe(FILTRES).source, LIBELLE_SEUL)
    )
    const plante = replante.find(({ chemin }) => chemin === FILTRES)!

    expect(emprunteLaValeur(FILTRES, plante.source, PAR_CHEMIN)).toBe(true)
    expect(destinationsDepuis(plante.source)).toEqual([])
    expect([...navigations(replante)]).toEqual([...NAVIGATION_NOMMEE])
  })

  it("ne prend pas pour un emprunt de valeur un import de type", () => {
    const typeSeul = `import type { ${VALEUR_RESERVEE} } from "${SPECIFIEUR}"`

    expect(importeDe(typeSeul, MODULE_DE_LA_VALEUR)).toBe(true)
    expect(emprunteLaValeur(FILTRES, typeSeul, PAR_CHEMIN)).toBe(false)
    expect(destinationsDepuis(typeSeul)).toEqual([])
  })
})

describe("Valeur réservée — la garde tombe sur un lien planté", () => {
  it("nomme le module client qui décide son lien depuis la valeur, écrit dans un vrai fichier", () => {
    const reel = sourceDe(FILTRES).source
    const plante = sourceApres(reel, LIEN_PLANTE)
    expect(plante).not.toBe(reel)

    expect([...navigations(avecSource(FILTRES, reel))]).toEqual([
      ...NAVIGATION_NOMMEE,
    ])
    expect([...navigations(avecSource(FILTRES, plante))]).toEqual([
      [FILTRES, ["/produits", "/categorie/${slug}"]],
      ...NAVIGATION_NOMMEE,
    ])
  })

  it("nomme aussi une destination écrite sans le modèle du lien planté", () => {
    const plante = sourceApres(
      sourceDe(FILTRES).source,
      [
        `import { ${VALEUR_RESERVEE} } from "${SPECIFIEUR}"`,
        "",
        "export function hrefDeFacette(slug: string): string {",
        "  if (slug === SLUG_SANS_STRUCTURE) return '/produits'",
        "}",
      ].join("\n")
    )

    expect([...navigations(avecSource(FILTRES, plante))]).toEqual([
      [FILTRES, ["/produits"]],
      ...NAVIGATION_NOMMEE,
    ])
  })
})

describe("Valeur réservée — l'instrument qui voit le lien", () => {
  it("voit la comparaison, quel que soit le côté où la valeur est écrite", () => {
    for (const [source, destinations] of COMPARAISONS) {
      expect(destinationsDepuis(source), source).toEqual(destinations)
    }
  })

  it("voit la valeur dans un `case` comme dans un retour anticipé", () => {
    expect(
      destinationsDepuis(
        "switch (slug) {\n  case SLUG_SANS_STRUCTURE:\n    return '/produits'\n}"
      )
    ).toEqual(["/produits"])
    expect(
      destinationsDepuis(
        "if (slug === SLUG_SANS_STRUCTURE) return '/produits'\n"
      )
    ).toEqual(["/produits"])
  })

  it("voit un lien construit par un appel, et non écrit en littéral", () => {
    expect(
      destinationsDepuis(
        "const href = slug === SLUG_SANS_STRUCTURE ? buildSearchHref('', { categorySlug: slug }, {}, {}, '/produits') : urlCategorie(slug)"
      )
    ).toEqual(["/produits"])
  })

  it("ne voit pas une route d'un module voisin que le client atteint par ailleurs", () => {
    expect(
      destinationsDepuis(
        "const href = urlCategorie(SLUG_SANS_STRUCTURE)\nconst categorie = '/categorie/smartphones'\n"
      )
    ).toEqual([])
  })

  it("ne voit ni l'import seul, ni une valeur simplement reçue, ni une comparaison sans but", () => {
    for (const source of [
      `import { ${VALEUR_RESERVEE} } from "${SPECIFIEUR}"\n\nexport function v() {\n  return SLUG_SANS_STRUCTURE\n}\n`,
      "const href = `${SLUG_SANS_STRUCTURE}`",
      "return slug === SLUG_SANS_STRUCTURE ? LIBELLE_SANS_STRUCTURE : slug",
    ]) {
      expect(destinationsDepuis(source), source).toEqual([])
    }
  })

  it("s'arrête à l'énoncé, et n'emprunte pas la destination d'une autre ligne", () => {
    expect(
      destinationsDepuis(
        "function href(slug: string): string {\n  return slug === SLUG_SANS_STRUCTURE ? '/produits' : '/cat'\n}\nconst autre = '/categorie/inexistant'\n"
      )
    ).toEqual(["/produits", "/cat"])
  })
})
