import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import {
  creerCycleVieImageProduit,
  creerRegistreBrouillonImageProduitPrisma,
  type Horloge,
  type ImageProduitPromue,
  type LierBrouillonsImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import { createProduct, type ProductInput } from "@/lib/use-cases/admin-catalog"
import {
  creerHorlogeControllable,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const autreOwnerId = randomUUID()
const categoryId = randomUUID()
const categorySlug = `cat-brouillon-${categoryId.slice(0, 8)}`
const now = new Date("2026-02-01T12:00:00.000Z")
const productSlug = `produit-brouillon-${categoryId.slice(0, 8)}`

describe("registre durable des Brouillons d'Image produit", () => {
  beforeAll(async () => {
    await prisma.user.createMany({
      data: [
        {
          id: ownerId,
          name: "Éditeur Brouillon",
          email: `brouillon-${ownerId}@example.test`,
          role: "admin",
        },
        {
          id: autreOwnerId,
          name: "Autre éditeur Brouillon",
          email: `autre-brouillon-${autreOwnerId}@example.test`,
          role: "admin",
        },
      ],
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
    await prisma.user.deleteMany({
      where: { id: { in: [ownerId, autreOwnerId] } },
    })
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

  function creerCycleVie(
    horloge: Horloge = { maintenant: () => new Date(now) },
    stockage = creerStockageImageProduitMemoire()
  ) {
    return {
      cycleVie: creerCycleVieImageProduit({
        stockage,
        registre: creerRegistreBrouillonImageProduitPrisma(horloge),
        horloge,
      }),
      stockage,
    }
  }

  async function enregistrerProduit(
    images: readonly ImageProduitPromue[],
    lier: LierBrouillonsImageProduit
  ) {
    const product = await createProduct(
      makeInput(images.map((image) => image.publicUrl)),
      {
        reindexProducts: async () => {},
        revalidateCatalog: () => {},
      },
      { lier, promues: images.map((image) => image.publicUrl) }
    )
    return { productId: product.id, result: product }
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

  it("refuse à un autre éditeur de revendiquer ou de libérer un identifiant copié", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/webp",
      size: 1234,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const revendication = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-autre-editeur",
      ownerId: autreOwnerId,
      draftIds: [demande.draftId],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })
    expect(revendication).toMatchObject({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce brouillon ne vous appartient pas",
    })

    const liberation = await cycleVie.relacherBrouillon({
      draftId: demande.draftId,
      ownerId: autreOwnerId,
    })
    expect(liberation).toEqual({
      ok: false,
      code: "proprietaire-incorrect",
      message: "Ce Brouillon d'Image produit ne vous appartient pas",
    })
    expect(stockage.promotions).toEqual([])
    expect(stockage.suppressionsBrouillons).toEqual([])
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({ state: "vivant", tentativeId: null, productId: null })
  })

  it("libère un Brouillon vivant et le rend alors revendiquable par personne", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/gif",
      size: 1234,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    expect(
      await cycleVie.relacherBrouillon({
        draftId: demande.draftId,
        ownerId,
      })
    ).toEqual({ ok: true, draftId: demande.draftId })
    expect(stockage.suppressionsBrouillons).toEqual([demande.draftId])
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({ state: "libéré", tentativeId: null, productId: null })

    const revendication = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-apres-liberation",
      ownerId,
      draftIds: [demande.draftId],
      enregistrer: async () => {
        throw new Error("Le Catalogue ne doit pas être appelé")
      },
    })
    expect(revendication).toMatchObject({
      ok: false,
      code: "brouillon-non-vivant",
    })
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({ state: "libéré", promotedPublicUrl: null })
  })

  it("laisse une seule revendication concurrente gagner et refuse explicitement l'autre", async () => {
    const { cycleVie, stockage } = creerCycleVie()
    const demande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/jpeg",
      size: 1234,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const revendiquer = (tentativeId: string) =>
      cycleVie.revendiquerEtEnregistrer({
        tentativeId,
        ownerId,
        draftIds: [demande.draftId],
        enregistrer: enregistrerProduit,
      })
    const [premier, second] = await Promise.all([
      revendiquer("tentative-concurrente-1"),
      revendiquer("tentative-concurrente-2"),
    ])
    const resultats = [premier, second]

    expect(resultats.filter((resultat) => resultat.ok)).toHaveLength(1)
    expect(resultats.filter((resultat) => !resultat.ok)).toHaveLength(1)
    const gagnant = resultats.find((resultat) => resultat.ok)
    const refus = resultats.find((resultat) => !resultat.ok)
    if (!gagnant?.ok || refus?.ok) {
      throw new Error("Une revendication devait gagner et l'autre être refusée")
    }
    expect(refus).toMatchObject({
      ok: false,
      code: "brouillon-non-vivant",
      message: expect.stringMatching(
        /autre tentative d'enregistrement.*Rechargez le formulaire/
      ),
    })
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({
      state: "revendiqué",
      tentativeId:
        gagnant === premier
          ? "tentative-concurrente-1"
          : "tentative-concurrente-2",
      productId: gagnant.productId,
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
    })
    expect(stockage.promotions).toEqual([
      {
        draftId: demande.draftId,
        publicUrl: `memoire://image/${demande.draftId}`,
      },
    ])
  })

  it("garde le retry idempotent après expiration et refuse un second Produit", async () => {
    const horloge = creerHorlogeControllable(now)
    const { cycleVie } = creerCycleVie(horloge.horloge)
    const demande = await cycleVie.demanderBrouillon({
      ownerId,
      contentType: "image/png",
      size: 1234,
    })
    if (!demande.ok) throw new Error("La demande devait réussir")

    const premier = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-produit-a",
      ownerId,
      draftIds: [demande.draftId],
      enregistrer: enregistrerProduit,
    })
    if (!premier.ok) throw new Error("La première revendication devait réussir")

    const retry = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-produit-a",
      ownerId,
      draftIds: [demande.draftId],
      resultatDejaPersiste: (productId) =>
        prisma.product.findUniqueOrThrow({ where: { id: productId } }),
      enregistrer: async () => {
        throw new Error("Le retry ne doit pas créer un second Produit")
      },
    })
    expect(retry).toMatchObject({
      ok: true,
      productId: premier.productId,
      images: premier.images,
    })

    let produitBAppele = false
    const second = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-produit-b",
      ownerId,
      draftIds: [demande.draftId],
      enregistrer: async () => {
        produitBAppele = true
        throw new Error("Le Produit B ne doit pas être enregistré")
      },
    })

    expect(second).toMatchObject({
      ok: false,
      code: "brouillon-non-vivant",
    })
    expect(produitBAppele).toBe(false)
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-produit-a",
      productId: premier.productId,
      promotedPublicUrl: `memoire://image/${demande.draftId}`,
    })
    horloge.avancer(48 * 60 * 60)
    const apresExpiration = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-produit-a",
      ownerId,
      draftIds: [demande.draftId],
      resultatDejaPersiste: (productId) =>
        prisma.product.findUniqueOrThrow({ where: { id: productId } }),
      enregistrer: async () => {
        throw new Error("Le retry expiré ne doit pas créer un second Produit")
      },
    })
    expect(apresExpiration).toMatchObject({
      ok: true,
      productId: premier.productId,
      images: premier.images,
    })
    expect(
      await prisma.product.findUniqueOrThrow({
        where: { id: premier.productId },
      })
    ).toMatchObject({ images: [`memoire://image/${demande.draftId}`] })
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
      enregistrer: enregistrerProduit,
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
    expect(stockage.suppressionsImagesPromues).toEqual([])
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
          {
            lier: async () => {
              throw new Error("échec de commit simulé")
            },
            promues: images.map((image) => image.publicUrl),
          }
        )
        return { productId: "inutilisé", result: null }
      },
    })

    expect(resultat).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(stockage.suppressionsImagesPromues).toEqual([demande.draftId])
    expect(await prisma.product.count({ where: { slug: productSlug } })).toBe(0)
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: demande.draftId },
      })
    ).toMatchObject({ state: "vivant", tentativeId: null, productId: null })
  })
})
