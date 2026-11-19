import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import { declarerApresEcriture } from "@/lib/apres-ecriture"
import { prisma } from "@/lib/db"
import {
  toIndexableProduct,
  type IndexableProduct,
} from "@/lib/index-projection"
import type { DocumentCatalogue } from "@/lib/use-cases/apres-ecriture/catalogue"
import {
  écrireLeStock,
  exécuterStock,
  fixer,
  OutOfStockError,
  reapprovisionner,
  reserver,
  verrouillerCommande,
  type EcritureStock,
} from "@/lib/use-cases/commande-stock"
import type { CatalogueEventProduct } from "@/lib/use-cases/cache-invalidation"
import type { JournalEffetsPostCommit } from "@/lib/use-cases/mutation-squelette"

const runId = randomUUID().slice(0, 8)
const slug = (suffix: string) => `stock-${runId}-${suffix}`

let categoryId: string

function journalMuette(): JournalEffetsPostCommit & { lignes: unknown[] } {
  const lignes: unknown[] = []
  return {
    lignes,
    enregistrer(mesure) {
      lignes.push(mesure)
    },
  }
}

function porteurs() {
  const reindexProducts = vi.fn<
    (produits: IndexableProduct[]) => Promise<void>
  >(async () => {})
  const revalidateCatalog =
    vi.fn<(produit: CatalogueEventProduct) => void | Promise<void>>()
  const purgeCatalogue =
    vi.fn<(produit: CatalogueEventProduct) => void | Promise<void>>()
  return { reindexProducts, revalidateCatalog, purgeCatalogue }
}

async function creerProduit(suffix: string, stocks: readonly number[]) {
  return prisma.product.create({
    data: {
      name: `Produit ${suffix}`,
      slug: slug(suffix),
      description: "Description",
      brand: "Marque",
      price: 1000,
      specs: {},
      images: [],
      isFeatured: false,
      featuredOrder: 0,
      freeShipping: false,
      categoryId,
      variants: {
        create: stocks.map((stock, index) => ({
          name: `Variante ${index}`,
          sku: `SKU-${runId}-${suffix}-${index}`,
          priceDelta: 0,
          stock,
        })),
      },
    },
    include: { variants: true },
  })
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { name: `Catégorie ${runId}`, slug: `cat-stock-${runId}` },
  })
  categoryId = category.id
})

afterAll(async () => {
  await prisma.product.deleteMany({
    where: { slug: { startsWith: `stock-${runId}-` } },
  })
  await prisma.category.deleteMany({ where: { slug: `cat-stock-${runId}` } })
  await prisma.$disconnect()
})

describe("écrireLeStock", () => {
  it("une seule déclaration par Produit pour deux Variantes du même Produit", async () => {
    const produit = await creerProduit("deux", [3, 4])
    const [a, b] = produit.variants

    const ecriture = await prisma.$transaction((tx) =>
      écrireLeStock(tx, [
        reapprovisionner(a!.id, 2),
        reapprovisionner(b!.id, 5),
      ])
    )

    expect(ecriture.plans).toHaveLength(1)
    expect(ecriture.plans[0]!.produitId).toBe(produit.id)
    const evenements = await prisma.automationEvent.findMany({
      where: {
        type: "variante.stock.changee",
        entityId: produit.id,
      },
    })
    expect(evenements).toHaveLength(1)
    expect(evenements[0]!.payload).toEqual({
      produitId: produit.id,
      slug: produit.slug,
      categoryId,
    })
  })

  it("une réservation refusée lève un seul refus qui porte chaque ligne en échec", async () => {
    const produit = await creerProduit("refus", [1, 2])
    const [a, b] = produit.variants

    let erreur: unknown
    try {
      await prisma.$transaction((tx) =>
        écrireLeStock(tx, [
          reserver(a!.id, 9, "Produit refus", "Variante 0", 1),
          reserver(b!.id, 8, "Produit refus", "Variante 1", 2),
        ])
      )
    } catch (e) {
      erreur = e
    }

    expect(erreur).toBeInstanceOf(OutOfStockError)
    expect((erreur as OutOfStockError).items).toHaveLength(2)
    expect((erreur as OutOfStockError).items.map((i) => i.requested)).toEqual([
      9, 8,
    ])
    expect(
      await prisma.automationEvent.count({
        where: { type: "variante.stock.changee", entityId: produit.id },
      })
    ).toBe(0)
  })

  it("une fixation déclare le changement de stock", async () => {
    const produit = await creerProduit("fixation", [5])
    const variant = produit.variants[0]!

    const ecriture = await prisma.$transaction((tx) =>
      écrireLeStock(tx, [fixer(variant.id, 12)])
    )

    expect(ecriture.plans).toHaveLength(1)
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      })
    ).toMatchObject({ stock: 12 })
    expect(ecriture.plans[0]!.documents[0]!.indexable.totalStock).toBe(12)
  })

  it("des mouvements vides ne lisent, n'écrivent et ne déclarent rien", async () => {
    const avant = await prisma.automationEvent.count()
    const ecriture = await prisma.$transaction((tx) => écrireLeStock(tx, []))

    expect(ecriture.plans).toEqual([])
    expect(await prisma.automationEvent.count()).toBe(avant)
  })

  it("une exception après l'écriture ne laisse aucun Événement", async () => {
    const produit = await creerProduit("rollback", [5])
    const variant = produit.variants[0]!

    await expect(
      prisma.$transaction(async (tx) => {
        await écrireLeStock(tx, [reapprovisionner(variant.id, 1)])
        throw new Error("échec après l'écriture")
      })
    ).rejects.toThrow("échec après l'écriture")

    expect(
      await prisma.automationEvent.count({
        where: { type: "variante.stock.changee", entityId: produit.id },
      })
    ).toBe(0)
    expect(
      await prisma.productVariant.findUniqueOrThrow({
        where: { id: variant.id },
      })
    ).toMatchObject({ stock: 5 })
  })

  it("un mouvement nommant une Variante supprimée ne déclare rien", async () => {
    const produit = await creerProduit("supprimee", [5])
    const variant = produit.variants[0]!
    await prisma.productVariant.delete({ where: { id: variant.id } })

    const ecriture = await prisma.$transaction((tx) =>
      écrireLeStock(tx, [reapprovisionner(variant.id, 1)])
    )

    expect(ecriture.plans).toEqual([])
    expect(
      await prisma.automationEvent.count({
        where: { type: "variante.stock.changee", entityId: produit.id },
      })
    ).toBe(0)
  })
})

describe("exécuterStock", () => {
  function ecriture(document: DocumentCatalogue): EcritureStock {
    return {
      plans: [
        {
          produitId: document.indexable.id,
          plan: declarerApresEcriture("variante.stock.changee", {
            produitId: document.indexable.id,
            slug: document.indexable.slug,
            categoryId: "categorie-test",
          }),
          documents: [document],
        },
      ],
    }
  }

  function document(totalStock: number): DocumentCatalogue {
    const indexable = toIndexableProduct({
      id: "produit-exec",
      name: "Produit",
      slug: "produit-exec",
      description: "",
      brand: "",
      price: 1000,
      specs: {},
      images: [],
      isFeatured: false,
      freeShipping: false,
      updatedAt: new Date(0),
      category: null,
      variants: [{ priceDelta: 0, stock: totalStock, name: "V", sku: "S" }],
    })
    return {
      indexable,
      evenement: {
        id: "produit-exec",
        slug: "produit-exec",
        categoryChain: [],
      },
    }
  }

  it("joue les trois conséquences dans l'ordre déclaré avec le stock journalisé", async () => {
    const effets = porteurs()
    const ordre: string[] = []
    effets.reindexProducts.mockImplementation(async () => {
      ordre.push("réindexation")
    })
    effets.revalidateCatalog.mockImplementation(() => {
      ordre.push("invalidation")
    })
    effets.purgeCatalogue.mockImplementation(() => {
      ordre.push("purge")
    })
    const doc = document(7)

    await exécuterStock(ecriture(doc), effets, journalMuette())

    expect(ordre).toEqual(["réindexation", "invalidation", "purge"])
    expect(effets.reindexProducts.mock.calls[0]![0][0]!.totalStock).toBe(7)
    expect(effets.revalidateCatalog).toHaveBeenCalledWith(doc.evenement)
    expect(effets.purgeCatalogue).toHaveBeenCalledWith(doc.evenement)
  })

  it("un port qui échoue n'interrompt pas le Produit suivant", async () => {
    const premier = document(3)
    const second = document(4)
    const effets = porteurs()
    effets.reindexProducts.mockImplementation(async (produits) => {
      if (produits[0]!.id === premier.indexable.id)
        throw new Error("moteur en panne")
    })

    const valeur: EcritureStock = {
      plans: [premier, second].map((doc) => ({
        produitId: doc.indexable.id,
        plan: declarerApresEcriture("variante.stock.changee", {
          produitId: doc.indexable.id,
          slug: doc.indexable.slug,
          categoryId: null,
        }),
        documents: [doc],
      })),
    }

    await expect(
      exécuterStock(valeur, effets, journalMuette())
    ).resolves.toBeUndefined()
    expect(effets.reindexProducts).toHaveBeenCalledTimes(2)
    expect(effets.revalidateCatalog).toHaveBeenCalledTimes(2)
    expect(effets.purgeCatalogue).toHaveBeenCalledTimes(2)
  })
})

describe("verrouillerCommande", () => {
  let verrouUserId: string

  beforeAll(async () => {
    verrouUserId = randomUUID()
    await prisma.user.create({
      data: {
        id: verrouUserId,
        email: `verrou-${runId}@test.ma`,
        name: "Client verrou",
      },
    })
  })

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { userId: verrouUserId } })
    await prisma.user.deleteMany({ where: { id: verrouUserId } })
  })

  it("rend faux pour une Commande absente", async () => {
    const present = await prisma.$transaction((tx) =>
      verrouillerCommande(tx, `absente-${runId}`)
    )
    expect(present).toBe(false)
  })

  it("rend vrai pour une Commande présente", async () => {
    const commande = await prisma.order.create({
      data: {
        userId: verrouUserId,
        cityName: "Ville",
        address: "Adresse",
        phone: "0600000000",
        total: 1000,
        shippingFee: 0,
        totalPayable: 1000,
        items: {
          create: {
            variantId: (await creerProduit("verrou", [1])).variants[0]!.id,
            productName: "Article",
            variantName: "V",
            price: 1000,
            quantity: 1,
          },
        },
      },
    })

    const present = await prisma.$transaction((tx) =>
      verrouillerCommande(tx, commande.id)
    )
    expect(present).toBe(true)
  })
})
