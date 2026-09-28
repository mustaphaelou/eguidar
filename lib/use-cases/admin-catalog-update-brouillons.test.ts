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
  creerRevendicationImagesProduit,
  type BrouillonImageProduitDemande,
  type CycleVieImageProduit,
  type RevendicationImagesProduit,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
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

/**
 * La règle de création appartient au Catalogue : un Produit qui porte des
 * Images produit doit les avoir promues. Les Produits de départ de cette suite
 * passent donc par la porte, comme un appelant réel. La liaison est neutre —
 * c'est la mise à jour, ci-dessous, qui observe la sienne.
 */
function revendicationPromue(...urls: string[]): RevendicationImagesProduit {
  return creerRevendicationImagesProduit({
    galerie: urls,
    promues: urls,
    lier: async () => undefined,
  })
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

/**
 * La Galerie produit telle que le formulaire la soumet : une Image produit déjà
 * persistée, ou un Brouillon en cours d'envoi. Ce sont les objets du module
 * neutre — la suite n'en déclare pas une forme de secours, elle n'a plus à
 * recomposer l'ordre qu'ils portent.
 */
function persistee(url: string): EntreeImageProduit {
  return { kind: "persistee", url }
}

function brouillon(demande: BrouillonImageProduitDemande): EntreeImageProduit {
  return {
    kind: "brouillon",
    draftId: demande.draftId,
    previewUrl: demande.previewUrl,
  }
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
  gallery: readonly EntreeImageProduit[],
  tentativeId: string,
  categoryIdPourMiseAJour: string = categoryId,
  effects = effetsSilencieux(),
  ownerPourMiseAJour: string = ownerId
) {
  return cycleVie.revendiquerEtEnregistrer({
    tentativeId,
    ownerId: ownerPourMiseAJour,
    galerie: gallery,
    enregistrer: async (revendication) => {
      const updated = await updateProduct(
        product.id,
        makeInput([...revendication.galerie], {
          categoryId: categoryIdPourMiseAJour,
          variants: variantesPersistees(product),
        }),
        effects,
        revendication
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
    // La preuve de bout en bout que l'ordre de l'éditeur atteint la base : la
    // galerie est soumise entière, dans l'ordre de l'éditeur, et l'appelant
    // ne fait que forward ce que le cycle de vie lui rend. Les deux Brouillons
    // sont intercalés entre deux Images produit déjà persistées, donc un
    // réassemblage par l'appelant — ou un ordre de promotion — les trahirait.
    const product = await createProduct(
      makeInput([existingImage, existingSecondImage]),
      effetsSilencieux(),
      revendicationPromue(existingImage, existingSecondImage)
    )
    const environnement = creerCycleVieMemoire()
    const premierDraft = await demander(environnement.cycleVie)
    const secondDraft = await demander(environnement.cycleVie, "image/png")

    const resultat = await mettreAJour(
      environnement.cycleVie,
      product,
      [
        brouillon(premierDraft),
        persistee(existingImage),
        brouillon(secondDraft),
        persistee(existingSecondImage),
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

  it("ne demande aucune suppression persistée quand un Brouillon d'Image produit échoue avant l'enregistrement", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux(),
      revendicationPromue(existingImage)
    )
    const environnement = creerCycleVieMemoire()
    const draft = await demander(environnement.cycleVie)
    environnement.stockage.failPromotion = true
    const effects = effetsSilencieux()

    const resultat = await mettreAJour(
      environnement.cycleVie,
      product,
      [persistee(existingImage), brouillon(draft)],
      "tentative-promotion-échouée",
      categoryId,
      effects
    )

    expect(resultat).toMatchObject({ ok: false, code: "stockage-refuse" })
    expect(effects.deleteImages).not.toHaveBeenCalled()
    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(unchanged.images).toEqual([existingImage])
  })

  it("ne demande aucune suppression quand un Brouillon d'Image produit n'est jamais revendiqué", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux(),
      revendicationPromue(existingImage)
    )
    const environnement = creerCycleVieMemoire()
    const draft = await demander(environnement.cycleVie)
    const effects = effetsSilencieux()

    const resultat = await mettreAJour(
      environnement.cycleVie,
      product,
      [persistee(existingImage), brouillon(draft)],
      "tentative-refusée",
      categoryId,
      effects,
      "autre-editeur"
    )

    expect(resultat).toMatchObject({
      ok: false,
      code: "proprietaire-incorrect",
    })
    expect(effects.deleteImages).not.toHaveBeenCalled()
    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(unchanged.images).toEqual([existingImage])
  })

  it("laisse les Brouillons revendicables après un échec et réussit au retry", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux(),
      revendicationPromue(existingImage)
    )
    const environnement = creerCycleVieMemoire()
    const draft = await demander(environnement.cycleVie)
    const gallery: EntreeImageProduit[] = [
      persistee(existingImage),
      brouillon(draft),
    ]

    const echec = await mettreAJour(
      environnement.cycleVie,
      product,
      gallery,
      "tentative-retry",
      "categorie-inexistante"
    )

    expect(echec).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      draft.draftId,
    ])
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
      effetsSilencieux(),
      revendicationPromue(existingImage)
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
      galerie: [persistee(existingImage), brouillon(draft)],
      enregistrer: async (revendication) => {
        const updated = await updateProduct(
          product.id,
          makeInput([...revendication.galerie], {
            variants: variantesPersistees(product),
          }),
          effetsSilencieux(),
          revendication
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
      effetsSilencieux(),
      revendicationPromue(existingImage)
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
    const effects = effetsSilencieux()

    const resultat = await cycleVie.revendiquerEtEnregistrer({
      tentativeId: "tentative-rollback",
      ownerId,
      galerie: [persistee(existingImage), brouillon(draft)],
      enregistrer: async (revendication) => {
        // La liaison d'abord, l'échec ensuite : la transaction du Catalogue
        // s'ouvre, lie le Brouillon, puis se referme sur une erreur. La
        // revocation est donc à prouver par la suite : une valeur ne se
        // refabrique pas à la main, et c'est bien la porte qui rend la seconde
        // — même galerie, même sous-ensemble promu, une liaison qui échoue.
        await updateProduct(
          product.id,
          makeInput([...revendication.galerie], {
            variants: variantesPersistees(product),
          }),
          effects,
          creerRevendicationImagesProduit({
            galerie: revendication.galerie,
            promues: revendication.promues,
            lier: async (productId, transaction) => {
              await revendication.lier(productId, transaction)
              throw new Error("échec après liaison")
            },
          })
        )
        return { productId: product.id, result: product }
      },
    })

    expect(resultat).toMatchObject({ ok: false, code: "catalogue-refuse" })
    expect(effects.deleteImages).not.toHaveBeenCalled()
    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: draft.draftId },
    })
    expect(row).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    expect(stockage.suppressionsImagesPromues).toEqual([draft.draftId])
    const unchanged = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(unchanged.images).toEqual([existingImage])
  })
})
