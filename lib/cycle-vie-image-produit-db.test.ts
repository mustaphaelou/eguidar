import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  creerCycleVieImageProduit,
  registreBrouillonImageProduitPrisma,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import { createProduct, type ProductInput } from "@/lib/use-cases/admin-catalog"
import { creerStockageImageProduitMemoire } from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const categoryId = randomUUID()
const categorySlug = `cat-brouillon-${categoryId.slice(0, 8)}`
const now = new Date("2026-02-01T12:00:00.000Z")
const productSlug = `produit-brouillon-${categoryId.slice(0, 8)}`

describe("registre durable des Brouillons d'Image produit", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Éditeur Brouillon",
        email: `brouillon-${ownerId}@example.test`,
        role: "admin",
      },
    })
    await prisma.category.create({
      data: { id: categoryId, name: "Catégorie Brouillon", slug: categorySlug },
    })
  })

  beforeEach(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
    await prisma.product.deleteMany({ where: { slug: productSlug } })
  })

  afterAll(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
    await prisma.product.deleteMany({ where: { slug: productSlug } })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.user.deleteMany({ where: { id: ownerId } })
    await prisma.$disconnect()
  })

  function makeInput(images: string[], slug = productSlug): ProductInput {
    return {
      name: "Produit avec Brouillon",
      slug,
      description: "Description",
      brand: "Marque",
      categoryId,
      price: 10000,
      specs: {},
      images,
      isFeatured: false,
      featuredOrder: 0,
      freeShipping: false,
      variants: [
        {
          name: "Standard",
          sku: `SKU-BROUILLON-${categoryId.slice(0, 8)}`,
          priceDelta: 0,
          stock: 2,
        },
      ],
    }
  }

  function creerCycleVie(stockage = creerStockageImageProduitMemoire()) {
    return {
      cycleVie: creerCycleVieImageProduit({
        stockage,
        registre: registreBrouillonImageProduitPrisma,
        horloge: { maintenant: () => new Date(now) },
      }),
      stockage,
    }
  }

  it("conserve l'identité, le propriétaire, la retention et l'état vivant", async () => {
    const { cycleVie } = creerCycleVie()
    const resultat = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/webp",
      size: 1234,
    })
    if (!resultat.ok) throw new Error("La demande devait réussir")

    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: resultat.draftId },
    })

    expect(row).toMatchObject({
      id: resultat.draftId,
      storageKey: `products/brouillons/${resultat.draftId}.webp`,
      mimeType: "image/webp",
      byteSize: 1234,
      ownerId,
      tentativeId: null,
      state: "vivant",
      promotedPublicUrl: null,
      productId: null,
    })
    expect(row.createdAt).toBeInstanceOf(Date)
    expect(row.expiresAt).toEqual(new Date(now.getTime() + 24 * 60 * 60 * 1000))
    expect(resultat.expiresAt).toEqual(row.expiresAt)
  })

  it("persiste les URLs promues dans l'ordre et lie les Brouillons dans la transaction Catalogue", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const premiereDemande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/jpeg",
      size: 2048,
    })
    const secondeDemande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/png",
      size: 2048,
    })
    if (!premiereDemande.ok || !secondeDemande.ok) {
      throw new Error("Les demandes devaient réussir")
    }

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-create",
      ownerId,
      draftIds: [premiereDemande.draftId, secondeDemande.draftId],
      enregistrer: async (images, lier) => {
        const product = await createProduct(
          makeInput(images.map((image) => image.publicUrl)),
          {
            reindexProducts: async () => {},
            revalidateCatalog: () => {},
          },
          lier
        )
        return { productId: product.id, result: product }
      },
    })
    if (!resultat.ok) throw new Error("La création devait réussir")

    const product = await prisma.product.findUniqueOrThrow({
      where: { id: resultat.productId },
    })
    const drafts = await prisma.brouillonImageProduit.findMany({
      where: { id: { in: [premiereDemande.draftId, secondeDemande.draftId] } },
      orderBy: { id: "asc" },
    })
    const expectedUrls = [
      `memoire://image/${premiereDemande.draftId}`,
      `memoire://image/${secondeDemande.draftId}`,
    ]
    expect(product.images).toEqual(expectedUrls)
    expect(drafts).toHaveLength(2)
    expect(drafts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: premiereDemande.draftId,
          state: "revendiqué",
          tentativeId: "tentative-create",
          productId: product.id,
          promotedPublicUrl: expectedUrls[0],
        }),
        expect.objectContaining({
          id: secondeDemande.draftId,
          state: "revendiqué",
          tentativeId: "tentative-create",
          productId: product.id,
          promotedPublicUrl: expectedUrls[1],
        }),
      ])
    )
    expect(stockage.deletedPromoted).toEqual([])
  })

  it("annule la revendication et nettoie la copie quand la transaction Catalogue échoue", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/png",
      size: 2048,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-échec",
      ownerId,
      draftIds: [demande.draftId],
      enregistrer: async (images, _lier) => {
        await createProduct(
          makeInput(images.map((image) => image.publicUrl)),
          {
            reindexProducts: async () => {},
            revalidateCatalog: () => {},
          },
          async () => {
            throw new Error("échec de commit simulé")
          }
        )
        return { productId: "inutilisé", result: null }
      },
    })

    expect(resultat).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(stockage.deletedPromoted).toEqual([demande.draftId])
    expect(await prisma.product.count({ where: { slug: productSlug } })).toBe(0)
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({ state: "vivant", tentativeId: null, productId: null })
  })
})
