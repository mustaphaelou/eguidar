import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import { semerLesRegles } from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
import {
  creerPortCatalogueMemoire,
  creerPortRechercheMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-11-02T07:00:00.000Z")
const PREFIXE = `idx-structure-${runId}`

function options(maintenant = MAINTENANT, delaiDeReprise = () => 0) {
  return { maintenant, delaiDeReprise }
}

async function creerStructure(suffixe: string, parentId: string | null = null) {
  return prisma.category.create({
    data: {
      name: `Structure ${suffixe}`,
      slug: `${PREFIXE}-${suffixe}`,
      parentId,
    },
  })
}

async function creerProduit(suffixe: string, categoryId: string | null) {
  return prisma.product.create({
    data: {
      name: `Produit ${suffixe}`,
      slug: `${PREFIXE}-${suffixe}`,
      description: "desc",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      categoryId,
    },
  })
}

async function ecrireSuppression(
  categorieId: string,
  faits: Record<string, unknown>
) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "structure.supprimee",
      entityType: "categorie",
      entityId: categorieId,
      occurredAt: MAINTENANT,
      payload: { categorieId, image: null, ...faits },
    })
  )
}

function idsIndexes(
  operations: ReturnType<typeof creerPortRechercheMemoire>["operations"]
): string[][] {
  return operations.flatMap((operation) =>
    operation.operation === "indexer" ? [operation.ids] : []
  )
}

function idsTries(ids: readonly string[]): string[] {
  return [...ids].sort()
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIXE } },
  })
  await prisma.$disconnect()
})

describe("l'action index.structure d'une Structure supprimée", () => {
  it("réindexe chaque branche de destination, jamais la branche supprimée", async () => {
    const cibleProduits = await creerStructure("cible-produits")
    const cibleEnfants = await creerStructure("cible-enfants")
    const enfantDeLaCible = await creerStructure(
      "cible-enfants-enfant",
      cibleEnfants.id
    )
    const supprimee = await creerStructure("supprimee")
    const autre = await creerStructure("autre")

    const produitCible = await creerProduit("cible", cibleProduits.id)
    const produitEnfant = await creerProduit("cible-enfant", enfantDeLaCible.id)
    const produitSupprime = await creerProduit("supprime", supprimee.id)
    const produitAutre = await creerProduit("autre", autre.id)
    const produitSansStructure = await creerProduit("sans", null)

    await ecrireSuppression(supprimee.id, {
      destinations: [cibleProduits.id, cibleEnfants.id],
      produitsSansStructure: false,
    })
    const recherche = creerPortRechercheMemoire()

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { recherche: recherche.port })
    )

    const branches = idsIndexes(recherche.operations).map(idsTries)
    expect(branches).toEqual([
      idsTries([produitCible.id]),
      idsTries([produitEnfant.id]),
    ])
    const indexes = new Set(
      idsIndexes(recherche.operations).flatMap((ids) => ids)
    )
    expect(indexes.has(produitSupprime.id)).toBe(false)
    expect(indexes.has(produitAutre.id)).toBe(false)
    expect(indexes.has(produitSansStructure.id)).toBe(false)
  })

  it("réindexe les Produits laissés Sans Structure quand aucune destination n'est employée", async () => {
    const supprimee = await creerStructure("sans-destination")
    const autre = await creerStructure("sans-destination-autre")
    const produitSansStructure = await creerProduit(
      "sans-destination-produit",
      null
    )
    const produitAutre = await creerProduit(
      "sans-destination-autre-produit",
      autre.id
    )

    await ecrireSuppression(supprimee.id, {
      destinations: [],
      produitsSansStructure: true,
    })
    const recherche = creerPortRechercheMemoire()

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { recherche: recherche.port })
    )

    // La branche Sans Structure est globale : l'action réindexe l'ensemble des
    // Produits orphelins, pas seulement ceux de cette suppression.
    const indexes = idsIndexes(recherche.operations).flatMap((ids) => ids)
    expect(indexes).toContain(produitSansStructure.id)
    expect(indexes).not.toContain(produitAutre.id)
  })

  it("ne réindexe aucun Produit quand la Structure supprimée n'en laissait aucun", async () => {
    const supprimee = await creerStructure("vide")

    await ecrireSuppression(supprimee.id, {
      destinations: [],
      produitsSansStructure: false,
    })
    const recherche = creerPortRechercheMemoire()
    const catalogue = creerPortCatalogueMemoire()

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, {
        recherche: recherche.port,
        catalogue: catalogue.port,
      })
    )

    expect(idsIndexes(recherche.operations)).toEqual([])
    // L'invalidation reste déclarée et s'exécute pour la même écriture.
    expect(catalogue.structures).toBe(1)
  })
})
