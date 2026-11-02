import { randomUUID } from "node:crypto"

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"

const { supprimerImagePersisteeMock, supprimerImageCategorieMock } = vi.hoisted(
  () => ({
    supprimerImagePersisteeMock: vi.fn(),
    supprimerImageCategorieMock: vi.fn(),
  })
)

vi.mock("@/lib/r2", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/r2")>()
  return {
    ...original,
    stockageImageProduitR2: {
      ...original.stockageImageProduitR2,
      supprimerImagePersistee: supprimerImagePersisteeMock,
      supprimerImageCategorie: supprimerImageCategorieMock,
    },
  }
})

import { enregistrerEvenement } from "@/lib/automations/evenements"
import { executerLesEvenements } from "@/lib/automations/executeur"
import { semerLesRegles } from "@/lib/automations/regles"
import { prisma } from "@/lib/db"
import { dependancesDeTest } from "@/test/automations-memoire"

const runId = randomUUID().slice(0, 8)
const MAINTENANT = new Date("2026-10-28T07:00:00.000Z")
const REGLE = "suppression-images-produit-enregistre"
const REGLE_STRUCTURE = "suppression-images-structure-modifiee"

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
        galerie: null,
      },
    })
  )
}

async function ecrireEvenementStructure(
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
        imageRetiree,
        destination: null,
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
        images: urls,
      },
    })
  )
}

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
  supprimerImagePersisteeMock.mockReset()
  supprimerImagePersisteeMock.mockResolvedValue({ ok: true, valeur: null })
  supprimerImageCategorieMock.mockReset()
  supprimerImageCategorieMock.mockResolvedValue({ ok: true, valeur: null })
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

    await executerLesEvenements(options(), dependancesDeTest(MAINTENANT))

    expect(supprimerImagePersisteeMock.mock.calls.map(([url]) => url)).toEqual(
      urls
    )
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
    supprimerImagePersisteeMock.mockRejectedValueOnce(
      new Error("R2 indisponible")
    )

    const delai = 60_000
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => delai),
      dependancesDeTest(MAINTENANT)
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
      dependancesDeTest(plusTard)
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
    const tentees = new Set(
      supprimerImagePersisteeMock.mock.calls.map(([url]) => url)
    )
    expect([...tentees]).toEqual(urls)
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
    supprimerImagePersisteeMock.mockRejectedValueOnce(
      new Error("R2 indisponible")
    )

    const delai = 60_000
    const premier = await executerLesEvenements(
      options(MAINTENANT, () => delai),
      dependancesDeTest(MAINTENANT)
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
      dependancesDeTest(plusTard)
    )

    const executions = await prisma.automationRun.findMany({
      where: { ruleId: "suppression-images-produit" },
      orderBy: { attempt: "asc" },
    })
    expect(executions.map((execution) => execution.status)).toEqual([
      "echoue",
      "reussi",
    ])
    expect(
      new Set(supprimerImagePersisteeMock.mock.calls.map(([url]) => url))
    ).toEqual(new Set(urls))
  })
})

describe("l'action suppression.images pour une Structure", () => {
  it("supprime l'image retirée dans l'espace de noms de la catégorie", async () => {
    const categorieId = randomUUID()
    const image = `https://cdn.example.test/categories/${runId}-ancienne.jpg`
    await ecrireEvenementStructure(categorieId, image)

    await executerLesEvenements(options(), dependancesDeTest(MAINTENANT))

    expect(supprimerImageCategorieMock.mock.calls.map(([url]) => url)).toEqual([
      image,
    ])
    expect(supprimerImagePersisteeMock).not.toHaveBeenCalled()
    const execution = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_STRUCTURE, attempt: 1 },
    })
    expect(execution).toMatchObject({ status: "reussi", lastError: null })
  })

  it("laisse une Exécution échouée avec son erreur, puis réussit au réessai", async () => {
    const categorieId = randomUUID()
    const image = `https://cdn.example.test/categories/${runId}-panne.jpg`
    await ecrireEvenementStructure(categorieId, image)
    supprimerImageCategorieMock.mockRejectedValueOnce(
      new Error("R2 indisponible")
    )

    const premier = await executerLesEvenements(
      options(MAINTENANT, () => 60_000),
      dependancesDeTest(MAINTENANT)
    )

    expect(premier.echoues).toBe(1)
    const echec = await prisma.automationRun.findFirstOrThrow({
      where: { ruleId: REGLE_STRUCTURE, attempt: 1 },
    })
    expect(echec).toMatchObject({
      status: "echoue",
      lastError: "R2 indisponible",
    })

    const plusTard = new Date(MAINTENANT.getTime() + 60_001)
    await executerLesEvenements(
      options(plusTard, () => 0),
      dependancesDeTest(plusTard)
    )

    const executions = await prisma.automationRun.findMany({
      where: { ruleId: REGLE_STRUCTURE },
      orderBy: { attempt: "asc" },
    })
    expect(executions.map((execution) => execution.status)).toEqual([
      "echoue",
      "reussi",
    ])
  })
})
