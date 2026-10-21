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

import { prisma } from "@/lib/db"
import { draftObjectKey, persistentObjectKey } from "@/lib/r2"
import {
  CatalogValidationError,
  createProduct,
  DraftConflictError,
  DraftPromotionRefusedError,
  updateProduct,
  type CatalogEffects,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  brouillon,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"
import {
  creerDemandeurDeBrouillon,
  creerEntreeProduit,
  creerEnvironnementDurable,
  creerEnvironnementMemoire,
  horlogeFixe,
  PANNES_DE_STOCKAGE,
  verifierAucuneCoutureDeBrouillon,
  verifierCompensationSurEchecDeTransaction,
  verifierLOrdreDesTroisPhases,
  verifierRefusBrouillonExpire,
  verifierRefusRegistreIndisponible,
  verifierRefusSansIdentifiants,
  verifierRefusStockage,
  verifierRepriseSansRejeu,
  verifierRevendicationAilleurs,
} from "@/test/recette-catalogue-brouillons"

const ownerId = randomUUID()
const categoryId = randomUUID()
const runId = categoryId.slice(0, 8)
const categorySlug = `cat-update-brouillons-${runId}`
const productSlug = `produit-update-brouillons-${runId}`
const autreProductSlug = `${productSlug}-autre`
const existingImage = "https://cdn.test/produits/persistee-1.webp"
const existingSecondImage = "https://cdn.test/produits/persistee-2.webp"
const dateInitiale = new Date("2026-03-01T10:00:00.000Z")

const makeInput = creerEntreeProduit(categoryId, {
  name: "Produit mis à jour",
  description: "Description",
  slug: () => productSlug,
  variants: () => [
    { name: "Standard", sku: `SKU-UPDATE-${runId}`, priceDelta: 0, stock: 2 },
  ],
})

const demander = creerDemandeurDeBrouillon(ownerId)

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
    await prisma.product.deleteMany({
      where: { slug: { startsWith: productSlug } },
    })
  })

  afterAll(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: productSlug } },
    })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.user.deleteMany({ where: { id: ownerId } })
    await prisma.$disconnect()
  })

  it("promet les nouveaux Brouillons et les insère à la place soumise", async () => {
    const product = await createProduct(
      makeInput([existingImage, existingSecondImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const premier = await demander(environnement.cycleVie)
    const second = await demander(environnement.cycleVie, "image/png")
    const urlPremier = urlImagePersistee(premier.draftId, "image/webp")
    const urlSecond = urlImagePersistee(second.draftId, "image/png")

    const updated = await updateProduct(
      product.id,
      makeInput(
        [
          brouillon(premier.draftId),
          persistee(existingImage),
          brouillon(second.draftId),
          persistee(existingSecondImage),
        ],
        {
          variants: variantesPersistees(product),
          tentativeId: "tentative-mixte",
          ownerId,
        }
      ),
      environnement.effets
    )

    expect(updated.images).toEqual([
      urlPremier,
      existingImage,
      urlSecond,
      existingSecondImage,
    ])
    const persiste = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(persiste.images).toEqual([
      urlPremier,
      existingImage,
      urlSecond,
      existingSecondImage,
    ])
    expect(environnement.stockage.promotions).toEqual([
      {
        draftId: premier.draftId,
        cleSource: draftObjectKey(premier.draftId, "image/webp"),
        cle: persistentObjectKey(premier.draftId, "image/webp"),
        publicUrl: urlPremier,
      },
      {
        draftId: second.draftId,
        cleSource: draftObjectKey(second.draftId, "image/png"),
        cle: persistentObjectKey(second.draftId, "image/png"),
        publicUrl: urlSecond,
      },
    ])
    expect(environnement.stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(premier.draftId, "image/webp"),
      draftObjectKey(second.draftId, "image/png"),
    ])
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
    expect(environnement.registre.records.get(premier.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-mixte",
      productId: product.id,
      promotedPublicUrl: urlPremier,
    })
    expect(environnement.registre.records.get(second.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-mixte",
      productId: product.id,
      promotedPublicUrl: urlSecond,
    })
  })

  it("enregistre un réordonnancement de la Galerie exactement tel que soumis", async () => {
    const troisiemeImage = "https://cdn.test/produits/persistee-3.webp"
    const product = await createProduct(
      makeInput([existingImage, existingSecondImage, troisiemeImage]),
      effetsSilencieux()
    )
    const effets = effetsSilencieux()

    const updated = await updateProduct(
      product.id,
      makeInput([troisiemeImage, existingImage, existingSecondImage], {
        variants: variantesPersistees(product),
      }),
      effets
    )

    expect(updated.images).toEqual([
      troisiemeImage,
      existingImage,
      existingSecondImage,
    ])
    const persiste = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(persiste.images).toEqual([
      troisiemeImage,
      existingImage,
      existingSecondImage,
    ])
    expect(effets.deleteImages).toHaveBeenCalledExactlyOnceWith([])
  })

  it("ne touche à aucune couture de Brouillon quand la Galerie n'en porte aucun", async () => {
    const product = await createProduct(
      makeInput([existingImage, existingSecondImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)

    await verifierAucuneCoutureDeBrouillon(
      environnement,
      [existingImage, existingSecondImage],
      (effets) =>
        updateProduct(
          product.id,
          makeInput(
            [persistee(existingImage), persistee(existingSecondImage)],
            {
              variants: variantesPersistees(product),
              tentativeId: "tentative-sans-brouillon",
              ownerId,
            }
          ),
          effets
        )
    )

    expect(environnement.effets.deleteImages).toHaveBeenCalledExactlyOnceWith(
      []
    )
  })

  it("marque les Images produit retirées pour suppression après l'engagement, et jamais avant", async () => {
    const conservee = existingImage
    const retiree = existingSecondImage
    const product = await createProduct(
      makeInput([conservee, retiree]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)
    const promue = urlImagePersistee(draft.draftId, "image/webp")
    const supprimees: string[] = []
    const effets: CatalogEffects = {
      ...environnement.effets,
      deleteImages: async (urls) => {
        const engage = await prisma.product.findUniqueOrThrow({
          where: { id: product.id },
          select: { images: true },
        })
        expect(engage.images).toEqual([promue, conservee])
        supprimees.push(...urls)
      },
    }

    const updated = await updateProduct(
      product.id,
      makeInput([brouillon(draft.draftId), persistee(conservee)], {
        variants: variantesPersistees(product),
        tentativeId: "tentative-retrait",
        ownerId,
      }),
      effets
    )

    expect(updated.images).toEqual([promue, conservee])
    expect(supprimees).toEqual([retiree])
  })

  it("compense la promotion quand la transaction échoue et laisse le Produit dans son état antérieur", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    await verifierCompensationSurEchecDeTransaction(environnement, draft, () =>
      updateProduct(
        product.id,
        makeInput([persistee(existingImage), brouillon(draft.draftId)], {
          variants: variantesPersistees(product),
          tentativeId: "tentative-transaction-échouée",
          ownerId,
          categoryId: randomUUID(),
        }),
        environnement.effets
      )
    )

    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(inchange.images).toEqual([existingImage])
    expect(environnement.effets.deleteImages).not.toHaveBeenCalled()
  })

  it("rend le Produit existant à la resoumission du même identifiant de tentative, sans réappliquer la promotion", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const premierBrouillon = await demander(environnement.cycleVie)
    const secondBrouillon = await demander(environnement.cycleVie)
    const entree = makeInput(
      [
        persistee(existingImage),
        brouillon(premierBrouillon.draftId),
        brouillon(secondBrouillon.draftId),
      ],
      {
        variants: variantesPersistees(product),
        tentativeId: "tentative-reprise",
        ownerId,
      }
    )

    const { premier, reprise } = await verifierRepriseSansRejeu(
      environnement,
      (effets) => updateProduct(product.id, entree, effets)
    )

    expect(reprise.images).toEqual(premier.images)
  })

  it("refuse une reprise qui désigne un autre Produit que celui de l'URL", async () => {
    const premier = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const second = await createProduct(
      makeInput([existingSecondImage], {
        slug: autreProductSlug,
        variants: [
          {
            name: "Standard",
            sku: `SKU-UPDATE-${runId}-autre`,
            priceDelta: 0,
            stock: 2,
          },
        ],
      }),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    const engage = await updateProduct(
      premier.id,
      makeInput([persistee(existingImage), brouillon(draft.draftId)], {
        variants: variantesPersistees(premier),
        tentativeId: "tentative-partagée",
        ownerId,
      }),
      environnement.effets
    )
    expect(engage.id).toBe(premier.id)

    const promesse = updateProduct(
      second.id,
      makeInput([brouillon(draft.draftId)], {
        slug: autreProductSlug,
        variants: variantesPersistees(second),
        tentativeId: "tentative-partagée",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftConflictError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(
      "Cette Tentative d'édition a déjà été enregistrée pour un autre Produit"
    )
    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: second.id },
    })
    expect(inchange.images).toEqual([existingSecondImage])
  })

  it("lie les Brouillons dans la transaction de la mise à jour, avec le registre durable", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementDurable(horlogeFixe(dateInitiale))
    const draft = await demander(environnement.cycleVie)
    const promue = urlImagePersistee(draft.draftId, "image/webp")

    const updated = await updateProduct(
      product.id,
      makeInput([persistee(existingImage), brouillon(draft.draftId)], {
        variants: variantesPersistees(product),
        tentativeId: "tentative-durable",
        ownerId,
      }),
      environnement.effets
    )

    expect(updated.images).toEqual([existingImage, promue])
    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: draft.draftId },
    })
    expect(row).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-durable",
      productId: product.id,
      promotedPublicUrl: promue,
    })
  })

  it("prépare la promotion avant la transaction, y lie les Brouillons, puis supprime les sources après son engagement", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    const updated = await verifierLOrdreDesTroisPhases(
      environnement,
      (effets) =>
        updateProduct(
          product.id,
          makeInput([persistee(existingImage), brouillon(draft.draftId)], {
            variants: variantesPersistees(product),
            tentativeId: "tentative-ordre-des-trois-phases",
            ownerId,
          }),
          effets
        )
    )

    expect(updated.images).toEqual([
      existingImage,
      urlImagePersistee(draft.draftId, "image/webp"),
    ])
  })

  it("annule la liaison et la promotion si la transaction échoue après elle", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementDurable(horlogeFixe(dateInitiale))
    const draft = await demander(environnement.cycleVie)
    const effets: CatalogEffects = {
      ...environnement.effets,
      cycleVie: {
        ...environnement.effets.cycleVie,
        confirmerBrouillons: async (...confirmation) => {
          await environnement.cycleVie.confirmerBrouillons(...confirmation)
          throw new Error("échec après la liaison")
        },
      },
    }

    const promesse = updateProduct(
      product.id,
      makeInput([persistee(existingImage), brouillon(draft.draftId)], {
        variants: variantesPersistees(product),
        tentativeId: "tentative-rollback",
        ownerId,
      }),
      effets
    )

    await expect(promesse).rejects.toThrow("échec après la liaison")
    const row = await prisma.brouillonImageProduit.findUniqueOrThrow({
      where: { id: draft.draftId },
    })
    expect(row).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(draft.draftId, "image/webp"),
    ])
    expect(effets.deleteImages).not.toHaveBeenCalled()
    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(inchange.images).toEqual([existingImage])
  })

  it("laisse les Brouillons revendicables après un échec et réussit au retry", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)
    const galerie = [persistee(existingImage), brouillon(draft.draftId)]

    const echec = updateProduct(
      product.id,
      makeInput(galerie, {
        variants: variantesPersistees(product),
        tentativeId: "tentative-retry",
        ownerId,
        categoryId: "catégorie-inexistante",
      }),
      environnement.effets
    )

    await expect(echec).rejects.toThrow()
    await expect(echec).rejects.not.toBeInstanceOf(UserFacingError)
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    const apresEchec = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(apresEchec.images).toEqual([existingImage])

    const retry = await updateProduct(
      product.id,
      makeInput(galerie, {
        variants: variantesPersistees(product),
        tentativeId: "tentative-retry",
        ownerId,
      }),
      environnement.effets
    )

    const promue = urlImagePersistee(draft.draftId, "image/webp")
    expect(retry.images).toEqual([existingImage, promue])
    const apresRetry = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(apresRetry.images).toEqual([existingImage, promue])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-retry",
      productId: product.id,
      promotedPublicUrl: promue,
    })
  })

  it("refuse un Brouillon expiré en refus typé, sans toucher au Produit", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    await verifierRefusBrouillonExpire(environnement, draft, () =>
      updateProduct(
        product.id,
        makeInput([persistee(existingImage), brouillon(draft.draftId)], {
          variants: variantesPersistees(product),
          tentativeId: "tentative-expirée",
          ownerId,
        }),
        environnement.effets
      )
    )

    expect(environnement.effets.deleteImages).not.toHaveBeenCalled()
    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(inchange.images).toEqual([existingImage])
  })

  it("refuse un Brouillon revendiqué par une autre tentative en refus typé", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    await verifierRevendicationAilleurs(environnement, ownerId, draft, () =>
      updateProduct(
        product.id,
        makeInput([persistee(existingImage), brouillon(draft.draftId)], {
          variants: variantesPersistees(product),
          tentativeId: "tentative-conflit",
          ownerId,
        }),
        environnement.effets
      )
    )

    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(inchange.images).toEqual([existingImage])
  })

  it("refuse un Brouillon d'un autre éditeur, sans demander de suppression", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    const promesse = updateProduct(
      product.id,
      makeInput([persistee(existingImage), brouillon(draft.draftId)], {
        variants: variantesPersistees(product),
        tentativeId: "tentative-refusée",
        ownerId: "autre-éditeur",
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftPromotionRefusedError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(
      "Ce brouillon ne vous appartient pas"
    )
    expect(environnement.stockage.promotions).toEqual([])
    expect(environnement.effets.deleteImages).not.toHaveBeenCalled()
    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(inchange.images).toEqual([existingImage])
  })

  it("remonte un stockage indisponible puis un stockage refusé en refus typés", async () => {
    for (const panne of PANNES_DE_STOCKAGE) {
      const enregistree = `https://cdn.test/produits/persistee-stockage-${panne}.webp`
      const slugDeLEssai = `${productSlug}-stockage-${panne}`
      const product = await createProduct(
        makeInput([enregistree], {
          slug: slugDeLEssai,
          variants: [
            {
              name: "Standard",
              sku: `SKU-UPDATE-${runId}-stockage-${panne}`,
              priceDelta: 0,
              stock: 2,
            },
          ],
        }),
        effetsSilencieux()
      )
      const environnement = creerEnvironnementMemoire(dateInitiale)
      const draft = await demander(environnement.cycleVie)

      await verifierRefusStockage(environnement, draft, panne, () =>
        updateProduct(
          product.id,
          makeInput([persistee(enregistree), brouillon(draft.draftId)], {
            slug: slugDeLEssai,
            variants: variantesPersistees(product),
            tentativeId: `tentative-stockage-${panne}`,
            ownerId,
          }),
          environnement.effets
        )
      )

      expect(environnement.effets.deleteImages).not.toHaveBeenCalled()
      const inchange = await prisma.product.findUniqueOrThrow({
        where: { id: product.id },
      })
      expect(inchange.images).toEqual([enregistree])
    }
  })

  it("remonte un registre indisponible à la revendication comme à la reprise", async () => {
    for (const operation of ["revendiquer", "lireParTentative"] as const) {
      const marque = operation === "revendiquer" ? "revendication" : "reprise"
      const enregistree = `https://cdn.test/produits/persistee-registre-${marque}.webp`
      const slugDeLEssai = `${productSlug}-registre-${marque}`
      const product = await createProduct(
        makeInput([enregistree], {
          slug: slugDeLEssai,
          variants: [
            {
              name: "Standard",
              sku: `SKU-UPDATE-${runId}-registre-${marque}`,
              priceDelta: 0,
              stock: 2,
            },
          ],
        }),
        effetsSilencieux()
      )
      const environnement = creerEnvironnementMemoire(dateInitiale)
      const draft = await demander(environnement.cycleVie)

      await verifierRefusRegistreIndisponible(environnement, operation, () =>
        updateProduct(
          product.id,
          makeInput([persistee(enregistree), brouillon(draft.draftId)], {
            slug: slugDeLEssai,
            variants: variantesPersistees(product),
            tentativeId: `tentative-registre-${marque}`,
            ownerId,
          }),
          environnement.effets
        )
      )
    }
  })

  it("refuse un Brouillon sans identifiants en refus typé, sans toucher à la couture", async () => {
    const product = await createProduct(
      makeInput([existingImage]),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    await verifierRefusSansIdentifiants(environnement, draft, () =>
      updateProduct(
        product.id,
        makeInput([persistee(existingImage), brouillon(draft.draftId)], {
          variants: variantesPersistees(product),
        }),
        environnement.effets
      )
    )
  })

  it("refuse une mise à jour qui nomme une Image produit d'un autre Produit, sans rien promouvoir", async () => {
    const proprietaire = existingImage
    const dunAutreProduit = "https://cdn.test/produits/dun-autre-produit.webp"
    const product = await createProduct(
      makeInput([proprietaire]),
      effetsSilencieux()
    )
    await createProduct(
      makeInput([dunAutreProduit], {
        slug: autreProductSlug,
        variants: [
          {
            name: "Standard",
            sku: `SKU-UPDATE-${runId}-autre`,
            priceDelta: 0,
            stock: 2,
          },
        ],
      }),
      effetsSilencieux()
    )
    const environnement = creerEnvironnementMemoire(dateInitiale)
    const draft = await demander(environnement.cycleVie)

    const promesse = updateProduct(
      product.id,
      makeInput([brouillon(draft.draftId), persistee(dunAutreProduit)], {
        variants: variantesPersistees(product),
        tentativeId: "tentative-image-glissee",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(CatalogValidationError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(
      "une entrée de Galerie ne peut pas nommer une Image produit qui appartient à un autre Produit"
    )
    expect(environnement.effets.deleteImages).not.toHaveBeenCalled()
    expect(environnement.stockage.promotions).toEqual([])
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    const inchange = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
    })
    expect(inchange.images).toEqual([proprietaire])
  })
})
