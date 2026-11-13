import { existsSync, readFileSync, readdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  estTagDeDetail,
  PREFIXE_DETAIL_BLOG,
  PREFIXE_DETAIL_CATEGORIE,
  PREFIXE_DETAIL_PRODUIT,
  PREFIXES_DETAIL,
} from "@/cache-handlers/prefixes-detail.js"
import {
  BLOG_TAG,
  blogDetailTag,
  CATEGORY_TAG,
  categoryDetailTag,
  HOME_TAG,
  PRODUCT_TAG,
  productDetailTag,
  tagsCatalogue,
  tagsStructure,
} from "@/lib/use-cases/cache-invalidation"
import {
  avecSource,
  importeDe,
  sourceDuCorpus,
  sourcesDeProduction,
  type SourceProduction,
} from "@/lib/use-cases/outils-frontiere"

const PROPRIETAIRE = "cache-handlers/prefixes-detail.js"
const CONSOMMATEUR = "lib/use-cases/cache-invalidation.ts"
const MODULE = "cache-handlers/prefixes-detail"

const PIECES_DU_CORPUS = [
  PROPRIETAIRE,
  CONSOMMATEUR,
  "cache-handlers/redis-handler.js",
  "scripts/purger-edge.mjs",
  "next.config.ts",
  "proxy.ts",
  "instrumentation.ts",
]

const LIAISONS: readonly (readonly [string, string])[] = [
  ["productDetailTag", "PREFIXE_DETAIL_PRODUIT"],
  ["categoryDetailTag", "PREFIXE_DETAIL_CATEGORIE"],
  ["blogDetailTag", "PREFIXE_DETAIL_BLOG"],
]

const RACINE_DEPOT = fileURLToPath(new URL("../../", import.meta.url))

function fichiersSous(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const enfant = path.join(dossier, entree.name)
    return entree.isDirectory() ? fichiersSous(enfant) : [enfant]
  })
}

function sourceProduction(absolu: string): SourceProduction {
  return {
    chemin: path.relative(RACINE_DEPOT, absolu).split(path.sep).join("/"),
    source: readFileSync(absolu, "utf8"),
  }
}

/**
 * Le helper partagé `sourcesDeProduction` ne lit que le TypeScript ; la garde
 * ajoute ici le JavaScript de production (cache-handlers, scripts .mjs).
 */
function sourcesJs(depuis: string, ...racines: string[]): SourceProduction[] {
  const estSource = (nom: string): boolean =>
    /\.m?js$/.test(nom) && !/\.test\.m?js$/.test(nom)
  return racines.flatMap((racine) =>
    fichiersSous(fileURLToPath(new URL(racine, depuis)))
      .filter((absolu) => estSource(path.basename(absolu)))
      .map(sourceProduction)
  )
}

/** Les fichiers TypeScript de la racine du dépôt, quand ils existent. */
function sourcesRacine(depuis: string, ...noms: string[]): SourceProduction[] {
  return noms
    .map((nom) => fileURLToPath(new URL(nom, depuis)))
    .filter((absolu) => existsSync(absolu))
    .map(sourceProduction)
}

const SOURCES: SourceProduction[] = [
  ...sourcesDeProduction(
    import.meta.url,
    "../../app",
    "../../components",
    "../../lib",
    "../../prisma",
    "../../scripts"
  ),
  ...sourcesJs(import.meta.url, "../../cache-handlers", "../../scripts"),
  ...sourcesRacine(
    import.meta.url,
    "../../next.config.ts",
    "../../proxy.ts",
    "../../instrumentation.ts"
  ),
]

function echapper(motif: string): string {
  return motif.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function proprietaires(
  sources: readonly SourceProduction[],
  prefixe: string
): string[] {
  const motif = new RegExp(`["'\`]${echapper(prefixe)}`)
  return sources
    .filter(({ source }) => motif.test(source))
    .map(({ chemin }) => chemin)
    .sort()
}

function corpsDe(source: string, declaration: string): string {
  const debut = source.indexOf(declaration)
  if (debut === -1) return ""
  const reste = source.slice(debut + declaration.length)
  const fin = reste.search(/\nexport\s/)
  return fin === -1 ? reste : reste.slice(0, fin)
}

function constructeurLie(
  source: string,
  nom: string,
  constante: string
): boolean {
  return corpsDe(source, `export const ${nom}`).includes(constante)
}

describe("Préfixes de détail — un propriétaire, prouvé", () => {
  it("le module neutre exporte les trois préfixes et leur liste", () => {
    expect(PREFIXE_DETAIL_PRODUIT).toBe("product:")
    expect(PREFIXE_DETAIL_CATEGORIE).toBe("category:")
    expect(PREFIXE_DETAIL_BLOG).toBe("blog:")
    expect(PREFIXES_DETAIL).toEqual([
      PREFIXE_DETAIL_PRODUIT,
      PREFIXE_DETAIL_CATEGORIE,
      PREFIXE_DETAIL_BLOG,
    ])
  })

  it("le prédicat reconnaît un tag de détail et rejette tout le reste", () => {
    for (const prefixe of PREFIXES_DETAIL) {
      expect(estTagDeDetail(`${prefixe}mon-slug`), prefixe).toBe(true)
    }

    for (const tag of [
      "products",
      "categories",
      "home",
      "blog",
      "",
      "product",
      "Product:mon-slug",
      "produits:mon-slug",
    ]) {
      expect(estTagDeDetail(tag), tag).toBe(false)
    }

    for (const tag of [undefined, null, 42, {}, []]) {
      expect(estTagDeDetail(tag), String(tag)).toBe(false)
    }
  })

  it("les trois constructeurs rendent des tags que le prédicat reconnaît", () => {
    expect(productDetailTag("mon-produit")).toBe("product:mon-produit")
    expect(categoryDetailTag("mon-telephone")).toBe("category:mon-telephone")
    expect(blogDetailTag("mon-article")).toBe("blog:mon-article")

    expect(estTagDeDetail(productDetailTag("mon-produit"))).toBe(true)
    expect(estTagDeDetail(categoryDetailTag("mon-telephone"))).toBe(true)
    expect(estTagDeDetail(blogDetailTag("mon-article"))).toBe(true)
  })

  it("les tags de liste et d'accueil ne sont pas des tags de détail", () => {
    for (const tag of [PRODUCT_TAG, CATEGORY_TAG, HOME_TAG, BLOG_TAG]) {
      expect(estTagDeDetail(tag), tag).toBe(false)
    }
  })

  it("les jeux de tags réels séparent le détail de la liste", () => {
    expect(tagsStructure().filter(estTagDeDetail)).toEqual([])

    const tags = tagsCatalogue({
      id: "p1",
      slug: "mon-produit",
      categoryChain: [{ slug: "racine" }],
    })
    expect(tags.filter(estTagDeDetail).length).toBeGreaterThan(0)
  })
})

describe("Le propriétaire des préfixes, prouvé par les sources", () => {
  it("le corpus de production est non vacant et porte le propriétaire et son consommateur", () => {
    const chemins = SOURCES.map(({ chemin }) => chemin)
    expect(SOURCES.length).toBeGreaterThan(100)
    expect(chemins).toEqual(expect.arrayContaining(PIECES_DU_CORPUS))
  })

  it("le module propriétaire est neutre : aucun import", () => {
    const { source } = sourceDuCorpus(SOURCES, PROPRIETAIRE)

    expect(source).not.toMatch(/\bimport\b/)
    expect(source).not.toMatch(/\brequire\s*\(/)
    expect(source).toMatch(
      /^export const PREFIXE_DETAIL_PRODUIT = "product:"$/m
    )
    expect(source).toMatch(
      /^export const PREFIXE_DETAIL_CATEGORIE = "category:"$/m
    )
    expect(source).toMatch(/^export const PREFIXE_DETAIL_BLOG = "blog:"$/m)
  })

  it("les trois préfixes n'ont qu'un propriétaire dans le code de production", () => {
    for (const prefixe of PREFIXES_DETAIL) {
      expect(proprietaires(SOURCES, prefixe), prefixe).toEqual([PROPRIETAIRE])
    }
  })

  it("les constructeurs et la purge lisent leurs préfixes dans le module", () => {
    const { source } = sourceDuCorpus(SOURCES, CONSOMMATEUR)

    expect(importeDe(source, MODULE)).toBe(true)
    for (const [nom, constante] of LIAISONS) {
      expect(constructeurLie(source, nom, constante), nom).toBe(true)
    }

    const purge = corpsDe(source, "export function demandeDePurge")
    expect(purge).toContain("PREFIXE_DETAIL_PRODUIT")
    expect(purge).toContain("PREFIXE_DETAIL_CATEGORIE")
  })
})

describe("La garde tombe dès qu'un constructeur dérive", () => {
  it("la garde tombe si un constructeur écrit son préfixe en dur", () => {
    const reel = sourceDuCorpus(SOURCES, CONSOMMATEUR).source
    const enViolation = reel.replace("${PREFIXE_DETAIL_BLOG}", "blog:")

    expect(enViolation).not.toBe(reel)
    expect(
      proprietaires(
        avecSource(SOURCES, CONSOMMATEUR, enViolation),
        PREFIXE_DETAIL_BLOG
      )
    ).toEqual([PROPRIETAIRE, CONSOMMATEUR].sort())
  })

  it("la garde tombe si un constructeur change de préfixe", () => {
    const reel = sourceDuCorpus(SOURCES, CONSOMMATEUR).source
    const enViolation = reel.replace(
      "`${PREFIXE_DETAIL_BLOG}${slug}`",
      "`${PREFIXE_DETAIL_PRODUIT}${slug}`"
    )

    expect(enViolation).not.toBe(reel)
    expect(
      constructeurLie(enViolation, "blogDetailTag", "PREFIXE_DETAIL_BLOG")
    ).toBe(false)
    expect(
      constructeurLie(enViolation, "blogDetailTag", "PREFIXE_DETAIL_PRODUIT")
    ).toBe(true)
    expect(estTagDeDetail("product:mon-article")).toBe(true)
  })
})
