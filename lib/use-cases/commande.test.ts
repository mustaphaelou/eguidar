import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { declarerApresEcriture } from "@/lib/apres-ecriture"
import { prisma } from "@/lib/db"
import { toIndexableProduct } from "@/lib/index-projection"
import type { DocumentCatalogue } from "@/lib/use-cases/apres-ecriture/catalogue"
import {
  écrireLeStock,
  exécuterEffetsCommande,
  exécuterStock,
  fixer,
  OutOfStockError,
  reapprovisionner,
  reserver,
  verrouillerCommande,
  type EffetsStock,
  type EcritureStock,
} from "@/lib/use-cases/commande"
import { creerJournalEffetsMemoire } from "@/test/journal-effets-memoire"

const runId = randomUUID().slice(0, 8)
const prefixe = `commande-stock-${runId}`
const email = `${prefixe}@test.ma`

let userId: string
let categorieId: string
let produitAId: string
let produitBId: string
let varianteA1: string
let varianteA2: string
let varianteB1: string

async function creerCommande(): Promise<string> {
  const commande = await prisma.order.create({
    data: {
      userId,
      cityName: "Ville",
      address: "1 Rue de Test",
      phone: "+212 600 000 000",
      total: 1000,
      shippingFee: 0,
      totalPayable: 1000,
    },
  })
  return commande.id
}

async function attendreLeVerrouEnAttente(): Promise<void> {
  const limite = Date.now() + 10_000
  while (Date.now() < limite) {
    const lignes = await prisma.$queryRawUnsafe<{ attendu: bigint }[]>(
      `SELECT count(*) AS attendu
         FROM pg_stat_activity
        WHERE datname = current_database()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query LIKE '%FROM "Order" WHERE id = $1 FOR UPDATE%'`
    )
    if (Number(lignes[0]?.attendu ?? 0) >= 1) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error("le verrou de la Commande n'a pas été attendu")
}

function documentPour(
  id: string,
  slug: string,
  totalStock: number
): DocumentCatalogue {
  return {
    indexable: toIndexableProduct({
      id,
      name: `Produit ${id}`,
      slug,
      description: "description",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      isFeatured: false,
      freeShipping: false,
      updatedAt: new Date("2026-11-19T10:00:00.000Z"),
      variants: [
        {
          priceDelta: 0,
          stock: totalStock,
          name: "Standard",
          sku: `SKU-${id}`,
        },
      ],
      category: null,
    }),
    evenement: { id, slug, categoryChain: [] },
  }
}

function ecriturePour(identifiants: readonly string[]): EcritureStock {
  return {
    plans: identifiants.map((id) => ({
      produitId: id,
      plan: declarerApresEcriture("variante.stock.changee", {
        produitId: id,
        slug: id,
        categoryId: null,
      }),
      document: documentPour(id, id, 3),
    })),
  }
}

function portsEnregistreurs() {
  const appels: { port: string; id: string }[] = []
  const effets: EffetsStock = {
    async reindexProducts(produits) {
      for (const produit of produits) {
        appels.push({ port: "reindexation", id: produit.id })
      }
    },
    revalidateCatalog(produit) {
      appels.push({ port: "invalidation-cache", id: produit.id })
    },
    purgeCatalogue(produit) {
      appels.push({ port: "purge-catalogue", id: produit.id })
    },
  }
  return { appels, effets }
}

beforeAll(async () => {
  const utilisateur = await prisma.user.create({
    data: { id: randomUUID(), email, name: "Client Commande Stock" },
  })
  userId = utilisateur.id

  const categorie = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `${prefixe}-categorie` },
  })
  categorieId = categorie.id

  const produitA = await prisma.product.create({
    data: {
      name: `Produit A ${runId}`,
      slug: `${prefixe}-a`,
      description: "description",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      categoryId: categorieId,
      variants: {
        create: [
          { name: "A1", sku: `${prefixe}-a1`, priceDelta: 0, stock: 10 },
          { name: "A2", sku: `${prefixe}-a2`, priceDelta: 0, stock: 5 },
        ],
      },
    },
    include: { variants: true },
  })
  produitAId = produitA.id
  varianteA1 = produitA.variants[0]!.id
  varianteA2 = produitA.variants[1]!.id

  const produitB = await prisma.product.create({
    data: {
      name: `Produit B ${runId}`,
      slug: `${prefixe}-b`,
      description: "description",
      brand: "Marque",
      price: 2000,
      specs: {},
      images: [],
      categoryId: categorieId,
      variants: {
        create: [{ name: "B1", sku: `${prefixe}-b1`, priceDelta: 0, stock: 8 }],
      },
    },
    include: { variants: true },
  })
  produitBId = produitB.id
  varianteB1 = produitB.variants[0]!.id
})

beforeEach(async () => {
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.automationEvent.deleteMany({
    where: { entityId: { in: [produitAId, produitBId] } },
  })
  await prisma.productVariant.update({
    where: { id: varianteA1 },
    data: { stock: 10 },
  })
  await prisma.productVariant.update({
    where: { id: varianteA2 },
    data: { stock: 5 },
  })
  await prisma.productVariant.update({
    where: { id: varianteB1 },
    data: { stock: 8 },
  })
})

afterAll(async () => {
  await prisma.order.deleteMany({ where: { userId } })
  await prisma.automationEvent.deleteMany({
    where: { entityId: { in: [produitAId, produitBId] } },
  })
  await prisma.product.deleteMany({
    where: { id: { in: [produitAId, produitBId] } },
  })
  await prisma.category.delete({ where: { id: categorieId } })
  await prisma.user.delete({ where: { id: userId } })
  await prisma.$disconnect()
})

describe("verrouillerCommande", () => {
  it("rend faux pour une Commande absente et vrai pour une Commande présente", async () => {
    const commandeId = await creerCommande()
    await prisma.$transaction(async (tx) => {
      await expect(verrouillerCommande(tx, "commande-absente")).resolves.toBe(
        false
      )
      await expect(verrouillerCommande(tx, commandeId)).resolves.toBe(true)
    })
  })

  it("attend le verrou de la Commande", async () => {
    const commandeId = await creerCommande()
    let liberer = () => {}
    const liberation = new Promise<void>((resolve) => {
      liberer = resolve
    })
    let verrouAcquis = () => {}
    const acquisition = new Promise<void>((resolve) => {
      verrouAcquis = resolve
    })
    const transaction = prisma.$transaction(
      async (tx) => {
        await verrouillerCommande(tx, commandeId)
        verrouAcquis()
        await liberation
      },
      { timeout: 30_000 }
    )
    transaction.catch(() => {})
    await acquisition

    let secondAcquis = () => {}
    const secondeAcquisition = new Promise<void>((resolve) => {
      secondAcquis = resolve
    })
    const seconde = prisma.$transaction(
      async (tx) => {
        await verrouillerCommande(tx, commandeId)
        secondAcquis()
      },
      { timeout: 30_000 }
    )
    seconde.catch(() => {})

    try {
      await attendreLeVerrouEnAttente()
    } finally {
      liberer()
      await transaction
      await seconde
    }
    await secondeAcquisition
  }, 20_000)
})

describe("écrireLeStock", () => {
  it("une seule déclaration par Produit pour deux Variantes", async () => {
    const ecriture = await prisma.$transaction((tx) =>
      écrireLeStock(tx, [
        reapprovisionner(varianteA1, 1),
        reapprovisionner(varianteA2, 2),
      ])
    )

    expect(ecriture.plans).toHaveLength(1)
    expect(ecriture.plans[0]!.produitId).toBe(produitAId)
    expect(ecriture.plans[0]!.document.indexable.totalStock).toBe(18)

    const faits = await prisma.automationEvent.findMany({
      where: { type: "variante.stock.changee", entityId: produitAId },
    })
    expect(faits).toHaveLength(1)
    expect(faits[0]!.payload).toEqual({
      produitId: produitAId,
      slug: `${prefixe}-a`,
      categoryId: categorieId,
    })
  })

  it("lève un seul refus listant chaque ligne en échec et ne laisse aucun Événement", async () => {
    await prisma.productVariant.update({
      where: { id: varianteA1 },
      data: { stock: 1 },
    })
    await prisma.productVariant.update({
      where: { id: varianteB1 },
      data: { stock: 0 },
    })

    let refus: unknown
    try {
      await prisma.$transaction((tx) =>
        écrireLeStock(tx, [reserver(varianteA1, 5), reserver(varianteB1, 3)])
      )
    } catch (erreur) {
      refus = erreur
    }

    expect(refus).toBeInstanceOf(OutOfStockError)
    if (refus instanceof OutOfStockError) {
      expect(refus.items).toEqual([
        expect.objectContaining({ requested: 5, available: 1 }),
        expect.objectContaining({ requested: 3, available: 0 }),
      ])
    }
    expect(
      await prisma.automationEvent.count({
        where: {
          type: "variante.stock.changee",
          entityId: { in: [produitAId, produitBId] },
        },
      })
    ).toBe(0)
  })

  it("applique les mouvements dans l'ordre du tableau", async () => {
    await prisma.$transaction((tx) =>
      écrireLeStock(tx, [
        reapprovisionner(varianteA1, 3),
        reserver(varianteA1, 2),
      ])
    )

    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: varianteA1 },
    })
    expect(variante.stock).toBe(11)
  })

  it("ne lit, n'écrit et ne déclare rien pour des mouvements vides", async () => {
    await prisma.$transaction(async (tx) => {
      const lecture = vi.spyOn(tx.productVariant, "findMany")
      const ecriture = await écrireLeStock(tx, [])
      expect(ecriture).toEqual({ plans: [] })
      expect(lecture).not.toHaveBeenCalled()
    })
    expect(
      await prisma.automationEvent.count({
        where: {
          type: "variante.stock.changee",
          entityId: { in: [produitAId, produitBId] },
        },
      })
    ).toBe(0)
  })

  it("ne déclare rien pour un mouvement nommant une Variante supprimée", async () => {
    const ecriture = await prisma.$transaction((tx) =>
      écrireLeStock(tx, [reapprovisionner(randomUUID(), 3)])
    )

    expect(ecriture.plans).toEqual([])
    expect(
      await prisma.automationEvent.count({
        where: {
          type: "variante.stock.changee",
          entityId: { in: [produitAId, produitBId] },
        },
      })
    ).toBe(0)
  })

  it("déclare une fixation", async () => {
    const ecriture = await prisma.$transaction((tx) =>
      écrireLeStock(tx, [fixer(varianteA1, 42)])
    )

    expect(ecriture.plans).toHaveLength(1)
    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: varianteA1 },
    })
    expect(variante.stock).toBe(42)
    expect(ecriture.plans[0]!.document.indexable.totalStock).toBe(47)
  })

  it("ne laisse aucun Événement quand la transaction annule après l'écriture", async () => {
    try {
      await prisma.$transaction(async (tx) => {
        await écrireLeStock(tx, [fixer(varianteA1, 43)])
        throw new Error("annulation")
      })
    } catch {}

    const variante = await prisma.productVariant.findUniqueOrThrow({
      where: { id: varianteA1 },
    })
    expect(variante.stock).toBe(10)
    expect(
      await prisma.automationEvent.count({
        where: {
          type: "variante.stock.changee",
          entityId: { in: [produitAId, produitBId] },
        },
      })
    ).toBe(0)
  })
})

describe("exécuterStock", () => {
  it("exécute un Plan par Produit dans l'ordre des identifiants", async () => {
    const { appels, effets } = portsEnregistreurs()
    const journal = creerJournalEffetsMemoire()
    const ecriture = ecriturePour(["b-produit", "a-produit"])

    await exécuterStock(ecriture, effets, journal)

    expect(appels).toEqual([
      { port: "reindexation", id: "a-produit" },
      { port: "invalidation-cache", id: "a-produit" },
      { port: "purge-catalogue", id: "a-produit" },
      { port: "reindexation", id: "b-produit" },
      { port: "invalidation-cache", id: "b-produit" },
      { port: "purge-catalogue", id: "b-produit" },
    ])
    expect(journal.mesures).toHaveLength(6)
    expect(
      journal.mesures.every((mesure) => mesure.resultat === "succes")
    ).toBe(true)
  })

  it("un port qui échoue n'interrompt pas le Produit suivant", async () => {
    const { appels, effets } = portsEnregistreurs()
    const journal = creerJournalEffetsMemoire()
    const effetsQuiEchouent: EffetsStock = {
      ...effets,
      async reindexProducts(produits) {
        if (produits.some((produit) => produit.id === "a-produit")) {
          throw new Error("Moteur de recherche indisponible")
        }
        await effets.reindexProducts(produits)
      },
    }

    await expect(
      exécuterStock(
        ecriturePour(["a-produit", "b-produit"]),
        effetsQuiEchouent,
        journal
      )
    ).resolves.toBeUndefined()

    expect(appels).toEqual([
      { port: "invalidation-cache", id: "a-produit" },
      { port: "purge-catalogue", id: "a-produit" },
      { port: "reindexation", id: "b-produit" },
      { port: "invalidation-cache", id: "b-produit" },
      { port: "purge-catalogue", id: "b-produit" },
    ])
    expect(journal.mesures[0]).toMatchObject({ resultat: "echec" })
  })

  it("ne fait aucune lecture propre", async () => {
    const { effets } = portsEnregistreurs()
    const lectureProduits = vi.spyOn(prisma.product, "findMany")
    const lectureCategories = vi.spyOn(prisma.category, "findMany")

    await exécuterStock(ecriturePour(["a-produit"]), effets)

    expect(lectureProduits).not.toHaveBeenCalled()
    expect(lectureCategories).not.toHaveBeenCalled()
    lectureProduits.mockRestore()
    lectureCategories.mockRestore()
  })
})

describe("exécuterEffetsCommande", () => {
  const snapshot = {
    userEmail: "client@test.ma",
    orderId: "cmd-1",
    items: [
      {
        productName: "Produit A",
        variantName: "Standard",
        price: 1000,
        quantity: 1,
      },
    ],
    total: 1000,
    shippingFee: 0,
    totalPayable: 1000,
    cityName: "Casablanca",
    address: "1 Rue de Test",
    phone: "+212 600 000 000",
  }

  it("exécute le stock puis l'e-mail quand un plan de Commande est présent", async () => {
    const ordre: string[] = []
    const journal = creerJournalEffetsMemoire()
    const plan = declarerApresEcriture("commande.statut.changee", {
      commandeId: "cmd-1",
      snapshot,
      statut: "confirmed",
    })

    await exécuterEffetsCommande(
      { plan, ecriture: ecriturePour(["a-produit"]) },
      {
        stock: {
          async reindexProducts() {
            ordre.push("stock:reindex")
          },
          async revalidateCatalog() {
            ordre.push("stock:cache")
          },
          async purgeCatalogue() {
            ordre.push("stock:purge")
          },
        },
        email: {
          async sendOrderStatusEmail(_order, statut) {
            ordre.push(`email:${statut}`)
          },
        },
      },
      journal
    )

    expect(ordre).toEqual([
      "stock:reindex",
      "stock:cache",
      "stock:purge",
      "email:confirmed",
    ])
    expect(journal.mesures).toHaveLength(4)
  })

  it("n'exécute aucun e-mail quand le plan est null", async () => {
    const { appels, effets } = portsEnregistreurs()
    const sendOrderPlacedEmail = vi.fn(async () => {})
    const sendOrderStatusEmail = vi.fn(async () => {})

    await exécuterEffetsCommande(
      { plan: null, ecriture: ecriturePour(["a-produit"]) },
      {
        stock: effets,
        email: { sendOrderPlacedEmail, sendOrderStatusEmail },
      }
    )

    expect(appels).toHaveLength(3)
    expect(sendOrderPlacedEmail).not.toHaveBeenCalled()
    expect(sendOrderStatusEmail).not.toHaveBeenCalled()
  })
})
