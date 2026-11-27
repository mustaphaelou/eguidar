import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it } from "vitest"

import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import { semerLesRegles } from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
import {
  creerPortImagesMemoire,
  dependancesDeTest,
  type PortImagesMemoire,
} from "@/test/automations-memoire"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")
const REGLE = "suppression-images-produit-enregistre"

let images: PortImagesMemoire

function options(maintenant = MAINTENANT, delaiDeReprise = () => 0) {
  return { maintenant, delaiDeReprise }
}

function urlsRetirees() {
  return [
    `https://cdn.example.test/${runId}-retiree-a.jpg`,
    `https://cdn.example.test/${runId}-retiree-b.jpg`,
  ]
}

async function ecrireEvenement(produitId: string, urls: string[]) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "produit.enregistre",
      entityType: "produit",
      entityId: produitId,
      occurredAt: MAINTENANT,
      payload: {
        produitId,
        slug: `produit-${produitId}`,
        slugPrecedent: null,
        categoryId: null,
        categoryIdPrecedent: null,
        imagesRetirees: urls,
      },
    })
  )
}

async function ecrireEvenementDeSuppression(produitId: string, urls: string[]) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "produit.supprime",
      entityType: "produit",
      entityId: produitId,
      occurredAt: MAINTENANT,
      payload: {
        produitId,
        slug: `produit-${produitId}`,
        categoryId: null,
        imagesRetirees: urls,
      },
    })
  )
}

async function ecrireEvenementStructureSupprimee(
  categorieId: string,
  image: string | null,
  faits: Record<string, unknown> = {}
) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "structure.supprimee",
      entityType: "categorie",
      entityId: categorieId,
      occurredAt: MAINTENANT,
      payload: {
        categorieId,
        imagesRetirees: image ? [image] : [],
        destinations: [],
        produitsSansStructure: false,
        ...faits,
      },
    })
  )
}

async function ecrireEvenementStructureModifiee(
  categorieId: string,
  imageRetiree: string
) {
  await prisma.$transaction((tx) =>
    enregistrerEvenement(tx, {
      type: "structure.modifiee",
      entityType: "categorie",
      entityId: categorieId,
      occurredAt: MAINTENANT,
      payload: {
        categorieId,
        imagesRetirees: [imageRetiree],
        destinations: [],
      },
    })
  )
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
  images = creerPortImagesMemoire()
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.$disconnect()
})

describe("l'action suppression.images", () => {
  it("supprime du stockage les URL retirées nommées dans la charge", async () => {
    const produitId = randomUUID()
    const urls = urlsRetirees()
    await ecrireEvenement(produitId, urls)

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(images.produit).toEqual(urls)
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE },
      orderBy: { attempt: "desc" },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("laisse une Exécution échouée avec son erreur, puis réussit au réessai", async () => {
    const produitId = randomUUID()
    const urls = urlsRetirees()
    await ecrireEvenement(produitId, urls)
    images.echouerProchainProduit(new Error("R2 indisponible"))

    const delai = 60_000
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => delai),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(premier.echoues).toBe(1)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: produitId },
    })
    expect(evenement.status).toBe("en_attente")
    expect(evenement.availableAt.getTime()).toBeGreaterThan(
      MAINTENANT.getTime()
    )
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE },
    })
    expect(echec.status).toBe("echoue")
    expect(echec.lastError).toContain("R2 indisponible")

    const plusTard = new Date(MAINTENANT.getTime() + delai + 1)
    const second = await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard, { images: images.port })
    )

    expect(second.echoues).toBe(0)
    const executions = await prisma.automationRun.findMany({
      where: { ruleId: REGLE },
      orderBy: { attempt: "asc" },
    })
    expect(executions.map((execution) => execution.status)).toEqual([
      "echoue",
      "reussi",
    ])
    expect([...new Set(images.produit)]).toEqual(urls)
    const relu = await prisma.automationEvent.findUniqueOrThrow({
      where: { id: evenement.id },
    })
    expect(relu.status).toBe("reussi")
    expect(relu.lastError).toBeNull()
  })

  it("supprime les images d'un Produit supprimé et laisse un réessai après échec", async () => {
    const produitId = randomUUID()
    const urls = urlsRetirees()
    await ecrireEvenementDeSuppression(produitId, urls)
    images.echouerProchainProduit(new Error("R2 indisponible"))

    const delai = 60_000
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => delai),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(premier.echoues).toBeGreaterThan(0)
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: "suppression-images-produit" },
    })
    expect(echec.status).toBe("echoue")
    expect(echec.lastError).toContain("R2 indisponible")

    const plusTard = new Date(MAINTENANT.getTime() + delai + 1)
    await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard, { images: images.port })
    )

    const executions = await prisma.automationRun.findMany({
      where: { ruleId: "suppression-images-produit" },
      orderBy: { attempt: "asc" },
    })
    expect(executions.map((execution) => execution.status)).toEqual([
      "echoue",
      "reussi",
    ])
    expect(new Set(images.produit)).toEqual(new Set(urls))
  })
})

describe("l'action suppression.images sur une Structure supprimée", () => {
  const REGLE_STRUCTURE_SUPPRIMEE = "suppression-images-structure-supprimee"

  it("supprime l'image de la Structure dans son espace de noms R2", async () => {
    const categorieId = randomUUID()
    const image = `https://cdn.example.test/categories/${runId}-${categorieId}.jpg`
    await ecrireEvenementStructureSupprimee(categorieId, image)

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(images.structure).toEqual([image])
    expect(images.produit).toEqual([])
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_STRUCTURE_SUPPRIMEE },
      orderBy: { attempt: "desc" },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("laisse une Exécution échouée avec son erreur, puis réussit au réessai", async () => {
    const categorieId = randomUUID()
    const image = `https://cdn.example.test/categories/${runId}-${categorieId}.png`
    await ecrireEvenementStructureSupprimee(categorieId, image)
    images.echouerProchaineStructure(new Error("R2 indisponible"))

    const delai = 60_000
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => delai),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(premier.echoues).toBe(1)
    const evenement = await prisma.automationEvent.findFirstOrThrow({
      where: { entityId: categorieId },
    })
    expect(evenement.status).toBe("en_attente")
    expect(evenement.availableAt.getTime()).toBeGreaterThan(
      MAINTENANT.getTime()
    )
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_STRUCTURE_SUPPRIMEE },
    })
    expect(echec.status).toBe("echoue")
    expect(echec.lastError).toContain("R2 indisponible")

    const plusTard = new Date(MAINTENANT.getTime() + delai + 1)
    const second = await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard, { images: images.port })
    )

    expect(second.echoues).toBe(0)
    const executions = await prisma.automationRun.findMany({
      where: { ruleId: REGLE_STRUCTURE_SUPPRIMEE },
      orderBy: { attempt: "asc" },
    })
    expect(executions.map((execution) => execution.status)).toEqual([
      "echoue",
      "reussi",
    ])
    expect(new Set(images.structure)).toEqual(new Set([image]))
  })
})

describe("l'action suppression.images sur une Structure modifiée", () => {
  const REGLE_STRUCTURE_MODIFIEE = "suppression-images-structure-modifiee"

  it("supprime l'image retirée dans l'espace de noms de la catégorie", async () => {
    const categorieId = randomUUID()
    const image = `https://cdn.example.test/categories/${runId}-ancienne.jpg`
    await ecrireEvenementStructureModifiee(categorieId, image)

    await executerLesEvenements(
      options(),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(images.structure).toEqual([image])
    expect(images.produit).toEqual([])
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_STRUCTURE_MODIFIEE, attempt: 1 },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("laisse une Exécution échouée avec son erreur, puis réussit au réessai", async () => {
    const categorieId = randomUUID()
    const image = `https://cdn.example.test/categories/${runId}-panne.jpg`
    await ecrireEvenementStructureModifiee(categorieId, image)
    images.echouerProchaineStructure(new Error("R2 indisponible"))

    const delai = 60_000
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => delai),
      dependancesDeTest(MAINTENANT, { images: images.port })
    )

    expect(premier.echoues).toBe(1)
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_STRUCTURE_MODIFIEE, attempt: 1 },
    })
    expect(echec).toMatchObject({
      status: "echoue",
      lastError: "R2 indisponible",
    })

    const plusTard = new Date(MAINTENANT.getTime() + delai + 1)
    await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard, { images: images.port })
    )

    const executions = await prisma.automationRun.findMany({
      where: { ruleId: REGLE_STRUCTURE_MODIFIEE },
      orderBy: { attempt: "asc" },
    })
    expect(executions.map((execution) => execution.status)).toEqual([
      "echoue",
      "reussi",
    ])
    expect(new Set(images.structure)).toEqual(new Set([image]))
  })
})
