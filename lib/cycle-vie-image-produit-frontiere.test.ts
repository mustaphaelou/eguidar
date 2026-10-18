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
const ROUTE_PRESIGNATION = "app/api/admin/uploads/presign/route.ts"
const GALERIE_PRODUIT = "components/admin/image-gallery-upload.tsx"
const MODULE_TELEVERSEMENT = "components/admin/televersement-brouillons.ts"
const ADAPTATEUR_TELEVERSEMENT =
  "components/admin/televersement-brouillons-http.ts"

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../infra",
  "../lib"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))

const IMPORTATEURS_R2_AUTORISES = [
  "infra/regle-cycle-vie-r2.ts",
  MODULE_CYCLE_VIE,
  MODULE_CATALOGUE,
  MODULE_STRUCTURE,
] as const

const IMPORTATEURS_CYCLE_VIE_AUTORISES = [
  "app/api/admin/uploads/delete/route.ts",
  ROUTE_PRESIGNATION,
  "infra/regle-cycle-vie-r2.ts",
  MODULE_CATALOGUE,
] as const

const ACTION_ADMIN_PRODUITS = "app/admin/produits/actions.ts"

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
        ROUTE_PRESIGNATION,
        MODULE_TELEVERSEMENT,
        ADAPTATEUR_TELEVERSEMENT,
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

  it("compose le cycle de vie aux routes, jamais aux Server Actions ni au port R2", () => {
    const routes = ["app/api/admin/uploads/delete/route.ts", ROUTE_PRESIGNATION]

    for (const chemin of routes) {
      expect(importeDe(source(chemin), MODULE_CYCLE_VIE), chemin).toBe(true)
      expect(importeDe(source(chemin), MODULE_R2), chemin).toBe(false)
    }
    expect(importeDe(source(ACTION_ADMIN_PRODUITS), MODULE_CYCLE_VIE)).toBe(
      false
    )
    expect(importeDe(source(ACTION_ADMIN_PRODUITS), MODULE_R2)).toBe(false)
    expect(importeDe(source(ACTION_ADMIN_PRODUITS), MODULE_CATALOGUE)).toBe(
      true
    )
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

    expect(appelants).toEqual([ADAPTATEUR_TELEVERSEMENT])
    expect(source(ADAPTATEUR_TELEVERSEMENT)).toContain(
      "JSON.stringify({ draftId })"
    )
  })

  it("n'a qu'un appelant de la route de pré-signation et lui transmet le fichier à téléverser", () => {
    const appelants = SOURCES.filter(({ source: contenu }) =>
      contenu.includes("/api/admin/uploads/presign")
    ).map(({ chemin }) => chemin)

    expect(appelants).toEqual([ADAPTATEUR_TELEVERSEMENT])
    expect(source(ADAPTATEUR_TELEVERSEMENT)).toContain(
      "JSON.stringify({ contentType, size })"
    )
  })

  it("ne laisse plus le composant de galerie parler HTTP : il consomme le module de téléversement", () => {
    const galerie = source(GALERIE_PRODUIT)

    expect(galerie).not.toContain("/api/admin/uploads")
    expect(galerie).not.toMatch(/\bfetch\s*\(/)
    expect(importeDe(galerie, MODULE_TELEVERSEMENT)).toBe(true)
  })

  it("confine le protocole client au module de téléversement et à son adaptateur, sans stockage ni cycle de vie", () => {
    expect(importateursDe(MODULE_TELEVERSEMENT)).toEqual(
      [ADAPTATEUR_TELEVERSEMENT, GALERIE_PRODUIT].sort()
    )
    expect(importateursDe(ADAPTATEUR_TELEVERSEMENT)).toEqual([
      MODULE_TELEVERSEMENT,
    ])
    for (const chemin of [MODULE_TELEVERSEMENT, ADAPTATEUR_TELEVERSEMENT]) {
      const atteints = atteignables(chemin, PAR_CHEMIN)
      expect(atteints.has(MODULE_R2), chemin).toBe(false)
      expect(atteints.has(MODULE_CYCLE_VIE), chemin).toBe(false)
    }
  })

  it("partage les deux suppressions par URL entre le Catalogue et la Structure, sans les confondre", () => {
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
