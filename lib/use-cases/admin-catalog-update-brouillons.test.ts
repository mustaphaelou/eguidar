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

import {
  creerCycleVieImageProduit,
  creerRegistreBrouillonImageProduitPrisma,
  type CycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import {
  createProduct,
  updateProduct,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const categoryId = randomUUID()
const categorySlug = `cat-update-brouillons-${categoryId.slice(0, 8)}`
const productSlug = `produit-update-brouillons-${categoryId.slice(0, 8)}`
const existingImage = "https://cdn.test/produits/persistee-1.webp"
const existingSecondImage = "https://cdn.test/produits/persistee-2.webp"
const dateInitiale = new Date("2026-03-01T10:00:00.000Z")

type GalerieTest =
  { kind: "persistee"; url: string } | { kind: "brouillon"; draftId: string }

function makeInput(
  images: string[],
  overrides: Partial<ProductInput> = {}
): ProductInput {
  return {
    name: "Produit mis à jour",
    slug: productSlug,
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
        sku: `SKU-UPDATE-${categoryId.slice(0, 8)}`,
        priceDelta: 0,
        stock: 2,
      },
    ],
    ...overrides,
  }
}

function effetsSilencieux() {
  return {
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
  }
}

function variantesPersistees(
  product: Awaited<ReturnType<typeof createProduct>>
) {
  return product.variants.map((variant) => ({
    id: variant.id,
    name: variant.name,
    sku: variant.sku,
    priceDelta: variant.priceDelta,
    stock: variant.stock,
  }))
}

function urlsDepuisGalerie(
  gallery: readonly GalerieTest[],
  promoted: readonly { draftId: string; publicUrl: string }[]
): string[] {
  const promotedByDraftId = new Map(
    promoted.map((image) => [image.draftId, image.publicUrl])
  )
  return gallery.map((image) => {
    if (image.kind === "persistee") return image.url
    const publicUrl = promotedByDraftId.get(image.draftId)
    if (publicUrl === undefined) throw new Error("promotion absente")
    return publicUrl
  })
}

async function demander(
  cycleVie: CycleVieImageProduit,
  contentType = "image/webp"
) {
  const resultat = await cycleVie.demanderBrouillon({
    ownerId,
    contentType,
    size: 2048,
  })
  if (!resultat.ok) throw new Error("La demande devait réussir")
  return resultat
}

function creerCycleVieMemoire() {
  const horloge = creerHorlogeControllable(dateInitiale)
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  return {
    cycleVie: creerCycleVieImageProduit({
      stockage,
      registre,
      horloge: horloge.horloge,
    }),
    horloge,
    stockage,
    registre,
  }
}

async function mettreAJour(
  cycleVie: CycleVieImageProduit,
  product: Awaited<ReturnType<typeof createProduct>>,
  gallery: readonly GalerieTest[],
  tentativeId: string,
  categoryIdPourMiseAJour: string = categoryId
) {
  return cycleVie.revendiquerEtEnregistrer({
    tentativeId,
    ownerId,
    draftIds: gallery.flatMap((image) =>
      image.kind === "brouillon" ? [image.draftId] : []
    ),
    enregistrer: async (promoted, lier) => {
      const updated = await updateProduct(
        product.id,
        makeInput(urlsDepuisGalerie(gallery, promoted), {
          categoryId: categoryIdPourMiseAJour,
          variants: variantesPersistees(product),
        }),
        effetsSilencieux(),
        {
          lier: (productId) => lier(productId),
          promues: promoted.map((image) => image.publicUrl),
        }
      )
      return { productId: updated.id, result: updated }
    },
  })
}

describe("mise à jour d'un Produit avec des Brouillons d'Image produit", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Éditeur Mise à jour",
        email: `update-brouillons-${ownerId}@example.test`,
        role: "admin",
      },
    })
    await prisma.category.create({
      data: {
        id: categoryId,
        name: "Catégorie Mise à jour",
        slug: categorySlug,
      },
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

  it("promet les nouveaux Brouillons et conserve l'ordre soumis", async () => {
    const product = await createProduct(
      makeInput([existingImage, existingSecondImage]),
      effetsSilencieux()
    )
    const environnement = creerCycleVieMemoire()
    const premierDraft = await demander(environnement.cycleVie)
    const secondDraft = await demander(environnement.cycleVie, "image/png")

    const resultat = await mettreAJour(
      environnement.cycleVie,
      product,
      [
        { kind: "brouillon", draftId: premierDraft.draftId },
        { kind: "persistee", url: existingImage },
        { kind: "brouillon", draftId: secondDraft.draftId },
        { kind: "persistee", url: existingSecondImage },
      ],
      "tentative-mixte"
    )

    expect(resultat).toMatchObject({ ok: true, productId: product.id })
    const persisted = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    const firstPromotedUrl = `memoire://image/${premierDraft.draftId}`
    const secondPromotedUrl = `memoire://image/${secondDraft.draftId}`
    expect(persisted.images).toEqual([
      firstPromotedUrl,
      existingImage,
      secondPromotedUrl,
      existingSecondImage,
    ])
    expect(
      environnement.registre.records.get(premierDraft.draftId)
    ).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-mixte",
      productId: product.id,
      promotedPublicUrl: firstPromotedUrl,
    })
    expect(
      environnement.registre.records.get(secondDraft.draftId)
    ).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-mixte",
      productId: product.id,
      promotedPublicUrl: secondPromotedUrl,
    })
    expect(environnement.stockage.promotions).toEqual([
      { draftId: premierDraft.draftId, publicUrl: firstPromotedUrl },
      { draftId: secondDraft.draftId, publicUrl: secondPromotedUrl },
    ])
  })

  it("laisse les Brouillons revendicables après un échec et réussit au retry", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerCycleVieMemoire()
    const draft = await demander(environnement.cycleVie)
    const gallery: GalerieTest[] = [
      { kind: "persistee", url: existingImage },
      { kind: "brouillon", draftId: draft.draftId },
    ]

    const echec = await mettreAJour(
      environnement.cycleVie,
      product,
      gallery,
      "tentative-retry",
      "categorie-inexistante"
    )

    expect(echec).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(environnement.stockage.deletedPromoted).toEqual([draft.draftId])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    const afterFailure = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(afterFailure.images).toEqual([existingImage])

    const retry = await mettreAJour(
      environnement.cycleVie,
      product,
      gallery,
      "tentative-retry"
    )

    expect(retry).toMatchObject({ ok: true, productId: product.id })
    const afterRetry = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    const promotedUrl = `memoire://image/${draft.draftId}`
    expect(afterRetry.images).toEqual([existingImage, promotedUrl])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-retry",
      productId: product.id,
      promotedPublicUrl: promotedUrl,
    })
  })

  it("lie les Brouillons dans la transaction du Produit avec le registre durable", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const stockage = creerStockageImageProduitMemoire()
    const cycleVie = creerCycleVieImageProduit({
      stockage,
      registre: creerRegistreBrouillonImageProduitPrisma({
        maintenant: () => new Date(dateInitiale),
      }),
      horloge: { maintenant: () => new Date(dateInitiale) },
    })
    const draft = await demander(cycleVie)

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-durable",
      ownerId,
      draftIds: [draft.draftId],
      enregistrer: async (promoted, lier) => {
        const updated = await updateProduct(
          product.id,
          makeInput(
            [existingImage, ...promoted.map((image) => image.publicUrl)],
            {
              variants: variantesPersistees(product),
            }
          ),
          effetsSilencieux(),
          {
            lier,
            promues: promoted.map((image) => image.publicUrl),
          }
        )
        return { productId: updated.id, result: updated }
      },
    })

    expect(resultat).toMatchObject({ ok: true, productId: product.id })
    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: draft.draftId },
    })
    expect(row).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-durable",
      productId: product.id,
      promotedPublicUrl: `memoire://image/${draft.draftId}`,
    })
  })

  it("annule la liaison et la promotion si la transaction échoue après elle", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const stockage = creerStockageImageProduitMemoire()
    const cycleVie = creerCycleVieImageProduit({
      stockage,
      registre: creerRegistreBrouillonImageProduitPrisma({
        maintenant: () => new Date(dateInitiale),
      }),
      horloge: { maintenant: () => new Date(dateInitiale) },
    })
    const draft = await demander(cycleVie)

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-rollback",
      ownerId,
      draftIds: [draft.draftId],
      enregistrer: async (promoted, lier) => {
        await updateProduct(
          product.id,
          makeInput(
            [existingImage, ...promoted.map((image) => image.publicUrl)],
            {
              variants: variantesPersistees(product),
            }
          ),
          effetsSilencieux(),
          {
            lier: async (productId, transaction) => {
              await lier(productId, transaction)
              throw new Error("échec après liaison")
            },
            promues: promoted.map((image) => image.publicUrl),
          }
        )
        return { productId: product.id, result: product }
      },
    })

    expect(resultat).toMatchObject({ ok: false, code: "catalogue-refuse" })
    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: draft.draftId },
    })
    expect(row).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    expect(stockage.deletedPromoted).toEqual([draft.draftId])
    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(unchanged.images).toEqual([existingImage])
  })
})
