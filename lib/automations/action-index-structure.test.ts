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
const REGLE_MODIFICATION = "indexation-structure"

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

async function ecrireModification(categorieId: string) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "structure.modifiee",
      entityType: "categorie",
      entityId: categorieId,
      occurredAt: MAINTENANT,
      payload: {
        categorieId,
        imageRetiree: null,
        destination: null,
      },
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

  it("réindexe la destination et les Produits Sans Structure quand les Produits sont orphelins", async () => {
    const cible = await creerStructure("orphelins-cible")
    const autre = await creerStructure("orphelins-autre")
    const supprimee = await creerStructure("orphelins-supprimee")
    const produitCible = await creerProduit("orphelins-cible", cible.id)
    const produitSansStructure = await creerProduit("orphelins-sans", null)
    const produitAutre = await creerProduit("orphelins-autre", autre.id)

    await ecrireSuppression(supprimee.id, {
      destinations: [cible.id],
      produitsSansStructure: true,
    })
    const recherche = creerPortRechercheMemoire()

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { recherche: recherche.port })
    )

    const indexes = new Set(
      idsIndexes(recherche.operations).flatMap((ids) => ids)
    )
    expect(indexes.has(produitCible.id)).toBe(true)
    expect(indexes.has(produitSansStructure.id)).toBe(true)
    expect(indexes.has(produitAutre.id)).toBe(false)
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

describe("l'action index.structure d'une Structure modifiée", () => {
  it("résout la branche après le commit et réindexe tous ses Produits", async () => {
    const racine = await creerStructure("racine")
    const branche = await creerStructure("branche", racine.id)
    const petite = await creerStructure("petite", branche.id)
    const produitRacine = await creerProduit("racine", racine.id)
    const produitBranche = await creerProduit("branche", branche.id)
    const produitPetite = await creerProduit("petite", petite.id)
    await ecrireModification(branche.id)

    const recherche = creerPortRechercheMemoire()
    const bilan = await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { recherche: recherche.port })
    )

    expect(bilan.reussis).toBe(1)
    expect(idsIndexes(recherche.operations).map(idsTries)).toEqual([
      idsTries([produitBranche.id, produitPetite.id]),
    ])
    const indexes = new Set(
      idsIndexes(recherche.operations).flatMap((ids) => ids)
    )
    expect(indexes.has(produitRacine.id)).toBe(false)
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_MODIFICATION, attempt: 1 },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("une panne de réindexation laisse une Exécution échouée, puis le réessai réussit", async () => {
    const racine = await creerStructure("panne-racine")
    const enfant = await creerStructure("panne-enfant", racine.id)
    const produit = await creerProduit("panne", enfant.id)
    await ecrireModification(enfant.id)

    const memoire = creerPortRechercheMemoire()
    let enPanne = true
    const port = {
      ...memoire.port,
      async indexer(produits: Parameters<typeof memoire.port.indexer>[0]) {
        if (enPanne) throw new Error("Meilisearch indisponible")
        await memoire.port.indexer(produits)
      },
    }

    const premier = await executerLesEvenements(
      options(MAINTENANT, () => 60_000),
      dependancesDeTest(MAINTENANT, { recherche: port })
    )

    expect(premier.echoues).toBe(1)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: enfant.id },
    })
    expect(evenement.status).toBe("en_attente")
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_MODIFICATION, attempt: 1 },
    })
    expect(echec).toMatchObject({
      status: "echoue",
      lastError: "Meilisearch indisponible",
    })

    enPanne = false
    const plusTard = new Date(MAINTENANT.getTime() + 60_001)
    await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard, { recherche: port })
    )

    expect(idsIndexes(memoire.operations).flatMap((ids) => ids)).toContain(
      produit.id
    )
    const reussite = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_MODIFICATION, attempt: 2 },
    })
    expect(reussite).toMatchObject({ status: "reussi", lastError: null })
  })
})
