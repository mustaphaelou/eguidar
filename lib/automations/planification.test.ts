import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  executerLesEvenements,
  type OptionsExecution,
} from "@/lib/automations/executeur"
import {
  planifierLaReconciliation,
  planifierLeDigestStockBas,
  jourDeLHorloge,
} from "@/lib/automations/planification"
import { semerLesRegles } from "@/lib/automations/regles"
import { toIndexableProduct } from "@/lib/index-projection"
import {
  creerPortEmailsMemoire,
  creerPortRechercheMemoire,
  dependancesDeTest,
} from "@/test/automations-memoire"

const runId = randomUUID().slice(0, 8)
const PREFIXE = `plan-${runId}-`
const JOUR = new Date("2026-10-28T07:00:00.000Z")
const LENDEMAIN = new Date("2026-10-29T07:00:00.000Z")
// Le digest nomme son destinataire par variable d'environnement (ADR-0041) :
// le test la pose lui-même, sans dépendre du `.env` de la machine.
const ADRESSE_DIGEST = `digest-${runId}@example.test`

let produitBasId = ""
let produitHautId = ""
let adresseDigestInitiale: string | undefined

function options(maintenant: Date): OptionsExecution {
  return { maintenant, delaiDeReprise: () => 0 }
}

async function reinitialiserLesExecutions(): Promise<void> {
  await prisma.automationRun.deleteMany()
}

beforeAll(async () => {
  adresseDigestInitiale = process.env.ADMIN_EMAIL
  process.env.ADMIN_EMAIL = ADRESSE_DIGEST

  const bas = await prisma.product.create({
    data: {
      name: `${PREFIXE}Écran bas`,
      slug: `${PREFIXE}ecran-bas`,
      description: "",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `${PREFIXE}bas-1`,
            priceDelta: 0,
            stock: 2,
          },
        ],
      },
    },
  })
  produitBasId = bas.id

  const haut = await prisma.product.create({
    data: {
      name: `${PREFIXE}Zèbre haut`,
      slug: `${PREFIXE}zebre-haut`,
      description: "",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      freeShipping: false,
      variants: {
        create: [
          {
            name: "Standard",
            sku: `${PREFIXE}haut-1`,
            priceDelta: 0,
            stock: 50,
          },
        ],
      },
    },
  })
  produitHautId = haut.id
})

beforeEach(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await semerLesRegles()
})

afterAll(async () => {
  await prisma.automationRun.deleteMany()
  await prisma.automationEvent.deleteMany()
  await prisma.automationRuleRevision.deleteMany()
  await prisma.automationRule.deleteMany()
  await prisma.product.deleteMany({ where: { slug: { startsWith: PREFIXE } } })
  if (adresseDigestInitiale === undefined) delete process.env.ADMIN_EMAIL
  else process.env.ADMIN_EMAIL = adresseDigestInitiale
  await prisma.$disconnect()
})

describe("la planification quotidienne", () => {
  it("ne crée qu'un événement par jour et par tâche, même rejouée", async () => {
    await expect(planifierLeDigestStockBas(JOUR)).resolves.toBe(true)
    await expect(planifierLeDigestStockBas(JOUR)).resolves.toBe(false)
    await expect(planifierLaReconciliation(JOUR)).resolves.toBe(true)
    await expect(planifierLaReconciliation(JOUR)).resolves.toBe(false)

    const evenements = await prisma.automationEvent.findMany({
      where: { entityType: "planification" },
      orderBy: { type: "asc" },
    })
    expect(evenements).toHaveLength(2)
    expect(evenements.map((evenement) => evenement.entityId)).toEqual([
      jourDeLHorloge(JOUR),
      jourDeLHorloge(JOUR),
    ])
    expect(evenements.map((evenement) => evenement.attemptOf)).toEqual([1, 1])
  })
})

describe("le digest du stock bas, sur une horloge", () => {
  it("produit le même texte pour la même journée, et un seul envoi", async () => {
    expect(produitHautId).toBeTruthy()
    await planifierLeDigestStockBas(JOUR)
    const emails = creerPortEmailsMemoire()
    const dependances = dependancesDeTest(JOUR, { emails: emails.port })

    await executerLesEvenements(options(JOUR), dependances)
    expect(emails.envoyes).toHaveLength(1)
    const premier = emails.envoyes[0]!
    expect(premier.cleIdempotence).toBe("digest.stock-bas/2026-10-28")
    expect(premier.destinataire).toBe(ADRESSE_DIGEST)
    expect(premier.texte).toContain("Stock bas du 2026-10-28 (seuil 5)")
    expect(premier.texte).toContain("« plan-")
    expect(premier.texte).toContain("Écran bas")
    expect(premier.texte).not.toContain("Zèbre haut")

    const premierTexte = premier.texte
    await reinitialiserLesExecutions()
    await prisma.automationEvent.updateMany({
      where: { entityId: "2026-10-28" },
      data: { status: "en_attente", attempts: 0, lockedUntil: null },
    })
    await executerLesEvenements(options(JOUR), dependances)

    expect(emails.appels).toHaveLength(2)
    expect(emails.appels[1]!.cleIdempotence).toBe(
      emails.appels[0]!.cleIdempotence
    )
    expect(emails.appels[1]!.texte).toBe(premierTexte)
    expect(emails.envoyes).toHaveLength(1)
  })

  it("change de journée quand l'horloge avance", async () => {
    await planifierLeDigestStockBas(JOUR)
    await planifierLeDigestStockBas(LENDEMAIN)
    const emails = creerPortEmailsMemoire()

    await executerLesEvenements(
      options(JOUR),
      dependancesDeTest(JOUR, { emails: emails.port })
    )
    await executerLesEvenements(
      options(LENDEMAIN),
      dependancesDeTest(LENDEMAIN, { emails: emails.port })
    )

    expect(emails.envoyes.map((envoi) => envoi.cleIdempotence)).toEqual([
      "digest.stock-bas/2026-10-28",
      "digest.stock-bas/2026-10-29",
    ])
    expect(emails.envoyes[1]!.texte).toContain("Stock bas du 2026-10-29")
  })
})

describe("la réconciliation nocturne", () => {
  it("réécrit l'index, retire les orphelins, puis n'a plus rien à faire", async () => {
    const produit = await prisma.product.findUniqueOrThrow({
      where: { id: produitBasId },
      include: { variants: true, category: true },
    })
    const documentBase = toIndexableProduct(produit)
    const recherche = creerPortRechercheMemoire([
      { ...documentBase, updatedAt: documentBase.updatedAt - 1 },
      {
        ...documentBase,
        id: `${PREFIXE}orphelin`,
        name: "Orphelin",
      },
    ])
    const signaux: string[] = []
    await planifierLaReconciliation(JOUR)

    await executerLesEvenements(
      options(JOUR),
      dependancesDeTest(JOUR, {
        recherche: recherche.port,
        signaler: (message) => signaux.push(message),
      })
    )

    const indexation = recherche.operations.find(
      (operation) => operation.operation === "indexer"
    )
    expect(indexation).toMatchObject({ operation: "indexer" })
    if (indexation?.operation !== "indexer")
      throw new Error("indexation absente")
    expect(indexation.ids).toEqual(
      expect.arrayContaining([produitBasId, produitHautId])
    )
    expect(
      recherche.operations.filter(
        (operation) => operation.operation === "desindexer"
      )
    ).toEqual([{ operation: "desindexer", id: `${PREFIXE}orphelin` }])
    expect(signaux).toHaveLength(1)
    expect(signaux[0]).toContain("Réconciliation du 2026-10-28")
    expect(signaux[0]).toMatch(/\d+ à réécrire, 1 à retirer/)

    await prisma.automationEvent.updateMany({
      where: { entityId: "2026-10-28" },
      data: { status: "en_attente", attempts: 0, lockedUntil: null },
    })
    await executerLesEvenements(
      options(JOUR),
      dependancesDeTest(JOUR, {
        recherche: recherche.port,
        signaler: (message) => signaux.push(message),
      })
    )

    expect(recherche.operations).toHaveLength(2)
    expect(signaux[1]).toContain("0 à réécrire, 0 à retirer")
  })
})
