import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import { semerLesRegles } from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
import {
  creerPortRechercheMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")
const REGLE = "indexation-structure"

function options(maintenant = MAINTENANT, delaiDeReprise = () => 0) {
  return { maintenant, delaiDeReprise }
}

const PREFIXE_CATEGORIE = `idx-struct-${runId}-`
const PREFIXE_PRODUIT = `idx-produit-${runId}-`

async function nettoyer() {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: PREFIXE_PRODUIT } },
  })
  await prisma.category.deleteMany({
    where: { slug: { startsWith: PREFIXE_CATEGORIE } },
  })
}

async function creerCategorie(suffixe: string, parentId: string | null = null) {
  return prisma.category.create({
    data: {
      name: `Structure ${suffixe}`,
      slug: `${PREFIXE_CATEGORIE}${suffixe}`,
      parentId,
    },
  })
}

async function creerProduit(categoryId: string, suffixe: string) {
  return prisma.product.create({
    data: {
      name: `Produit ${suffixe}`,
      slug: `${PREFIXE_PRODUIT}${suffixe}`,
      description: "desc",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      categoryId,
      variants: {
        create: {
          name: "Standard",
          sku: `SKU-${runId}-${suffixe}`,
          priceDelta: 0,
          stock: 1,
        },
      },
    },
  })
}

async function ecrireEvenement(categorieId: string) {
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
): string[] {
  return operations.flatMap((operation) =>
    operation.operation === "indexer" ? operation.ids : []
  )
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
  await nettoyer()
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await nettoyer()
  await prisma.$disconnect()
})

describe("l'action index.structure", () => {
  it("résout la branche après le commit et réindexe tous ses Produits", async () => {
    const racine = await creerCategorie("racine")
    const branche = await creerCategorie("branche", racine.id)
    const petite = await creerCategorie("petite", branche.id)
    const produitRacine = await creerProduit(racine.id, "racine")
    const produitBranche = await creerProduit(branche.id, "branche")
    const produitPetite = await creerProduit(petite.id, "petite")
    await ecrireEvenement(branche.id)

    const recherche = creerPortRechercheMemoire()
    const bilan = await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { recherche: recherche.port })
    )

    expect(bilan.reussis).toBe(1)
    expect(idsIndexes(recherche.operations).sort()).toEqual(
      [produitBranche.id, produitPetite.id].sort()
    )
    expect(idsIndexes(recherche.operations)).not.toContain(produitRacine.id)
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE, attempt: 1 },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("une panne de réindexation laisse une Exécution échouée, puis le réessai réussit", async () => {
    const racine = await creerCategorie("panne-racine")
    const enfant = await creerCategorie("panne-enfant", racine.id)
    const produit = await creerProduit(enfant.id, "panne")
    await ecrireEvenement(enfant.id)

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
      where: { ruleId: REGLE, attempt: 1 },
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

    expect(idsIndexes(memoire.operations)).toContain(produit.id)
    const reussite = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE, attempt: 2 },
    })
    expect(reussite).toMatchObject({ status: "reussi", lastError: null })
  })
})
