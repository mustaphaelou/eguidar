import { describe, expect, it } from "vitest"

import {
  atteignables,
  importeDe,
  sourcesDeProduction,
} from "@/lib/use-cases/outils-frontiere"

const MODULE_R2 = "lib/r2.ts"
const MODULE_CYCLE_VIE = "lib/cycle-vie-image-produit.ts"
const MODULE_CATALOGUE = "lib/use-cases/admin-catalog.ts"
const MODULE_STRUCTURE = "lib/use-cases/admin-structure.ts"
const ROUTE_LIBERATION = "app/api/admin/uploads/delete/route.ts"
const GALERIE_PRODUIT = "components/admin/image-gallery-upload.tsx"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../infra",
  "../lib"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))

/**
 * Seuls l'artefact de règle, le module propriétaire du cycle de vie, le
 * Catalogue et l'exception Structure peuvent atteindre l'adaptateur R2. Les
 * deux mutations n'appellent que la suppression post-commit d'une URL déjà
 * persistée ; les routes, forms et composants ne doivent jamais figurer dans
 * cette liste.
 *
 * `admin-structure.ts` est une exception intentionnelle : `Category.image` est
 * un champ URL libre antérieur au cycle de vie des Images produit. Cette
 * exception ne donne pas au produit le droit de supprimer par URL avant commit.
 */
const IMPORTATEURS_R2_AUTORISES = [
  "infra/regle-cycle-vie-r2.ts",
  MODULE_CYCLE_VIE,
  MODULE_CATALOGUE,
  MODULE_STRUCTURE,
] as const

/**
 * Les seuls consommateurs du module propriétaire sont ses traductions HTTP,
 * la mutation Catalogue qui compose la revendication et l'artefact de règle
 * R2. Un composant ou une mutation d'Administration parle donc au module,
 * jamais au port de stockage.
 */
const IMPORTATEURS_CYCLE_VIE_AUTORISES = [
  "app/admin/produits/actions.ts",
  "app/api/admin/uploads/delete/route.ts",
  "app/api/admin/uploads/presign/route.ts",
  "infra/regle-cycle-vie-r2.ts",
  MODULE_CATALOGUE,
] as const

function importateursDe(module: string): string[] {
  return SOURCES.filter(({ source }) => importeDe(source, module))
    .map(({ chemin }) => chemin)
    .sort()
}

function source(chemin: string): string {
  const trouvee = PAR_CHEMIN.get(chemin)
  if (!trouvee) throw new Error(`Source de production absente : ${chemin}`)
  return trouvee.source
}

describe("Cycle de vie des Images produit — frontière", () => {
  it("confine les imports R2 au propriétaire, à l'artefact et aux effets documentés", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(SOURCES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        GALERIE_PRODUIT,
        ROUTE_LIBERATION,
        "app/api/admin/uploads/presign/route.ts",
        MODULE_CATALOGUE,
        MODULE_STRUCTURE,
      ])
    )

    expect(importateursDe(MODULE_R2)).toEqual(
      [...IMPORTATEURS_R2_AUTORISES].sort()
    )
  })

  it("ne laisse aucune surface cliente d'Administration atteindre le stockage ni le cycle de vie", () => {
    const surfacesAdmin = SOURCES.filter(
      ({ chemin }) =>
        chemin.startsWith("app/admin/") ||
        chemin.startsWith("components/admin/") ||
        chemin.startsWith("app/api/admin/") ||
        chemin.startsWith("lib/use-cases/")
    )
    const clientsAdmin = surfacesAdmin.filter(({ source: contenu }) =>
      /^["']use client["']/m.test(contenu)
    )

    expect(clientsAdmin.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        "components/admin/product-form.tsx",
        GALERIE_PRODUIT,
      ])
    )
    for (const { chemin } of clientsAdmin) {
      const atteints = atteignables(chemin, PAR_CHEMIN)
      expect(atteints.has(MODULE_R2), chemin).toBe(false)
      expect(atteints.has(MODULE_CYCLE_VIE), chemin).toBe(false)
    }
  })

  it("compose le cycle de vie aux routes et à la mutation Catalogue, jamais au port R2", () => {
    const surfaces = [
      "app/admin/produits/actions.ts",
      "app/api/admin/uploads/delete/route.ts",
      "app/api/admin/uploads/presign/route.ts",
    ]

    for (const chemin of surfaces) {
      expect(importeDe(source(chemin), MODULE_CYCLE_VIE), chemin).toBe(true)
      expect(importeDe(source(chemin), MODULE_R2), chemin).toBe(false)
    }
    expect(
      importeDe(source("app/admin/produits/actions.ts"), MODULE_CATALOGUE)
    ).toBe(true)
    expect(importateursDe(MODULE_CYCLE_VIE)).toEqual(
      [...IMPORTATEURS_CYCLE_VIE_AUTORISES].sort()
    )
  })

  it("encode l'exception URL de Category.image sans l'ouvrir aux Images produit", () => {
    const structure = source(MODULE_STRUCTURE)

    expect(importeDe(structure, MODULE_R2)).toBe(true)
    expect(importeDe(structure, MODULE_CYCLE_VIE)).toBe(false)
    expect(structure).toContain(
      "stockageImageProduitR2.supprimerImageCategorie(url)"
    )
  })

  it("n'a qu'un appelant de la route de libération et lui transmet un draftId", () => {
    const appelants = SOURCES.filter(({ source: contenu }) =>
      contenu.includes("/api/admin/uploads/delete")
    ).map(({ chemin }) => chemin)

    expect(appelants).toEqual([GALERIE_PRODUIT])
    expect(source(GALERIE_PRODUIT)).toContain("JSON.stringify({ draftId })")
  })

  it("partage les deux suppressions par URL entre le Catalogue et la Structure, sans les confondre", () => {
    // Les espaces de noms sont disjoints : le Catalogue ne supprime que des
    // Images produit persistées, la Structure que des images de catégorie. Un
    // appel de chaque côté, et jamais le même des deux.
    const persistees = SOURCES.filter(({ source: contenu }) =>
      contenu.includes("stockageImageProduitR2.supprimerImagePersistee(url)")
    )
      .map(({ chemin }) => chemin)
      .sort()
    const categories = SOURCES.filter(({ source: contenu }) =>
      contenu.includes("stockageImageProduitR2.supprimerImageCategorie(url)")
    )
      .map(({ chemin }) => chemin)
      .sort()

    expect(persistees).toEqual([MODULE_CATALOGUE])
    expect(categories).toEqual([MODULE_STRUCTURE])
  })

  it("retire l'ancien alias générique de suppression par URL", () => {
    const aliases = SOURCES.filter(({ source: contenu }) =>
      /\bdeleteR2Object\b/.test(contenu)
    ).map(({ chemin }) => chemin)

    expect(aliases).toEqual([])
  })
})
