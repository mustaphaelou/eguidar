import { describe, expect, it } from "vitest"

import {
  atteignables,
  avecSource,
  importeDe,
  sourceApres,
  sourcesDeProduction,
  sourcesToutes,
  type SourceProduction,
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

const CETTE_SUITE = "lib/cycle-vie-image-produit-frontiere.test.ts"

const OPERATIONS_STOCKAGE = [
  "presignerBrouillon",
  "promouvoirBrouillon",
  "supprimerBrouillon",
  "supprimerImageCategorie",
  "supprimerImagePersistee",
  "supprimerImagePromue",
] as const

const OPERATIONS_PROMOTION = [
  "promouvoirBrouillon",
  "supprimerBrouillon",
  "supprimerImagePromue",
] as const

const PROTOCOLE_INVERSE = [
  "revendiquerEtEnregistrer",
  "RevendicationImagesProduit",
] as const

const SOURCES = sourcesDeProduction(
  import.meta.url,
  "../app",
  "../components",
  "../infra",
  "../lib"
)
const SOURCES_TOUTES = sourcesToutes(
  import.meta.url,
  "../app",
  "../components",
  "../infra",
  "../lib"
)
const PAR_CHEMIN = new Map(SOURCES.map((source) => [source.chemin, source]))

const IMPORTATEURS_R2_AUTORISES = [
  MODULE_CYCLE_VIE,
  MODULE_CATALOGUE,
  MODULE_STRUCTURE,
  // La route de pré-signation n'emprunte au stockage que le vocabulaire des
  // types de contenu, jamais une opération du port.
  ROUTE_PRESIGNATION,
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

function gestesNommes(source: string, gestes: readonly string[]): string[] {
  return gestes
    .filter((geste) => new RegExp(`\\b${geste}\\b`).test(source))
    .sort()
}

function operationsStockageNommees(source: string): string[] {
  return gestesNommes(source, OPERATIONS_STOCKAGE)
}

function promoteurs(sources: readonly SourceProduction[]): string[] {
  return sources
    .filter(
      ({ source }) => gestesNommes(source, OPERATIONS_PROMOTION).length > 0
    )
    .map(({ chemin }) => chemin)
    .sort()
}

function mentionsDuProtocoleInverse(
  sources: readonly SourceProduction[]
): string[] {
  return sources
    .filter(({ chemin }) => chemin !== CETTE_SUITE)
    .filter(({ source }) => gestesNommes(source, PROTOCOLE_INVERSE).length > 0)
    .map(({ chemin }) => chemin)
    .sort()
}

describe("Cycle de vie des Images produit — frontière", () => {
  it("confine les imports R2 au propriétaire, à l'artefact, au vocabulaire des types de contenu et aux effets documentés", () => {
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

  it("compose le cycle de vie aux routes, jamais aux Server Actions, et n'y nomme aucune opération de stockage", () => {
    const routes = ["app/api/admin/uploads/delete/route.ts", ROUTE_PRESIGNATION]

    for (const chemin of routes) {
      expect(importeDe(source(chemin), MODULE_CYCLE_VIE), chemin).toBe(true)
      expect(operationsStockageNommees(source(chemin)), chemin).toEqual([])
      expect(source(chemin), chemin).not.toContain("stockageImageProduitR2")
    }
    expect(importeDe(source(ROUTE_LIBERATION), MODULE_R2)).toBe(false)
    expect(source(ROUTE_PRESIGNATION)).toContain(
      'import { CONTENT_TYPES_IMAGE_PRODUIT } from "@/lib/r2"'
    )
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

describe("Cycle de vie des Images produit — le propriétaire de la promotion", () => {
  it("n'a que deux maisons pour les gestes de promotion : le port qui les implémente et le cycle de vie qui les appelle", () => {
    expect(SOURCES.length).toBeGreaterThan(200)
    expect(promoteurs(SOURCES)).toEqual([MODULE_CYCLE_VIE, MODULE_R2].sort())
    expect(operationsStockageNommees(source(MODULE_CYCLE_VIE))).toEqual(
      ["presignerBrouillon", ...OPERATIONS_PROMOTION].sort()
    )
    expect(operationsStockageNommees(source(MODULE_R2))).toEqual(
      [...OPERATIONS_STOCKAGE].sort()
    )
  })

  it("ne laisse le Catalogue atteindre le stockage que par le cycle de vie et son effet après engagement", () => {
    const catalogue = source(MODULE_CATALOGUE)

    expect(importeDe(catalogue, MODULE_CYCLE_VIE)).toBe(true)
    expect(gestesNommes(catalogue, OPERATIONS_PROMOTION)).toEqual([])
    expect(operationsStockageNommees(catalogue)).toEqual([
      "supprimerImagePersistee",
    ])
    expect(catalogue).toContain(
      "stockageImageProduitR2.supprimerImagePersistee(url)"
    )
  })

  it("la garde reconnaît un appel direct de promotion et épargne l'orchestrateur du propriétaire", () => {
    expect(
      gestesNommes(
        [
          "  await stockageImageProduitR2.promouvoirBrouillon({ draftId, contentType })",
          "  await port.supprimerBrouillon({ draftId, contentType })",
          "  await stockage.supprimerImagePromue({ draftId, contentType })",
          "  await stockage.presignerBrouillon({ draftId, contentType, size })",
          "  await stockageImageProduitR2.supprimerImagePersistee(url)",
          "  await stockageImageProduitR2.supprimerImageCategorie(url)",
        ].join("\n"),
        OPERATIONS_PROMOTION
      )
    ).toEqual([
      "promouvoirBrouillon",
      "supprimerBrouillon",
      "supprimerImagePromue",
    ])

    expect(
      operationsStockageNommees(
        [
          "async function promouvoirBrouillons(data: ProduitValide, effects: CatalogEffects) {",
          "  const preparation = await effects.preparerPromotionBrouillons({ tentativeId, ownerId, galerie })",
          "  if (!preparation.ok) throw erreurDePreparation(preparation)",
          "  await effects.confirmerBrouillons(id, promotions, port)",
          "  await effects.supprimerSources(promotions)",
          "  await stockageImageProduitR2.supprimerImagePersistee(url)",
          "}",
        ].join("\n")
      )
    ).toEqual(["supprimerImagePersistee"])
  })

  it("tombe sur un appel direct de promotion replanté dans le Catalogue", () => {
    const reel = source(MODULE_CATALOGUE)
    const plante = sourceApres(
      reel,
      "  await stockageImageProduitR2.promouvoirBrouillon({ draftId: identifiant, contentType })"
    )
    expect(plante).not.toBe(reel)

    const maisons = [MODULE_CYCLE_VIE, MODULE_R2].sort()
    expect(promoteurs(avecSource(SOURCES, MODULE_CATALOGUE, reel))).toEqual(
      maisons
    )
    expect(promoteurs(avecSource(SOURCES, MODULE_CATALOGUE, plante))).toEqual(
      [MODULE_CATALOGUE, ...maisons].sort()
    )
    expect(operationsStockageNommees(plante)).toEqual([
      "promouvoirBrouillon",
      "supprimerImagePersistee",
    ])
  })

  it("ne laisse aucune trace du protocole inversé dans les sources, suites comprises", () => {
    expect(SOURCES_TOUTES.length).toBeGreaterThan(SOURCES.length)
    expect(SOURCES_TOUTES.map(({ chemin }) => chemin)).toEqual(
      expect.arrayContaining([
        CETTE_SUITE,
        "lib/cycle-vie-image-produit.test.ts",
      ])
    )
    expect(mentionsDuProtocoleInverse(SOURCES_TOUTES)).toEqual([])
  })

  it("tombe sur le protocole inversé replanté dans le cycle de vie comme dans le Catalogue", () => {
    expect(
      mentionsDuProtocoleInverse(
        avecSource(
          SOURCES_TOUTES,
          MODULE_CYCLE_VIE,
          sourceApres(
            source(MODULE_CYCLE_VIE),
            "  await revendiquerEtEnregistrer({ tentativeId, ownerId, galerie, enregistrer })"
          )
        )
      )
    ).toEqual([MODULE_CYCLE_VIE])

    expect(
      mentionsDuProtocoleInverse(
        avecSource(
          SOURCES_TOUTES,
          MODULE_CATALOGUE,
          sourceApres(
            source(MODULE_CATALOGUE),
            "type Faits = RevendicationImagesProduit"
          )
        )
      )
    ).toEqual([MODULE_CATALOGUE])
  })
})
