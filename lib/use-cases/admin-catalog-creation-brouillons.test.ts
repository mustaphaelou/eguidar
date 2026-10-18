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
  type BrouillonImageProduit,
  type CycleVieImageProduit,
  type Horloge,
  type PreuvePromotion,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { draftObjectKey, persistentObjectKey } from "@/lib/r2"
import {
  createProduct,
  DraftConflictError,
  DraftExpiredError,
  DraftPromotionRefusedError,
  DraftRegistryUnavailableError,
  ImageStorageUnavailableError,
  SlugConflictError,
  type CatalogEffects,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  brouillon,
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
  persistee,
  urlImagePersistee,
} from "@/test/cycle-vie-image-produit-memoire"

const ownerId = randomUUID()
const categoryId = randomUUID()
const runId = categoryId.slice(0, 8)
const dateInitiale = new Date("2026-05-01T10:00:00.000Z")

const slug = (suffix: string) => `p-creation-brouillons-${runId}-${suffix}`

const MESSAGE_IDENTIFIANTS_INVALIDES =
  "Tentative d'édition ou propriétaire invalide"

const MESSAGE_BROUILLON_EXPIRE =
  "Ce Brouillon d'Image produit a expiré et son fichier peut déjà avoir été supprimé du stockage. Téléversez à nouveau l'image."

const MESSAGE_CONFLIT_REVENDICATION =
  "Ce Brouillon d'Image produit est déjà utilisé par une autre tentative d'enregistrement. Rechargez le formulaire ou retirez-le de la galerie."

const MESSAGE_BROUILLON_DEJA_LIBERE =
  "Ce Brouillon d'Image produit a déjà été libéré : il n'existe plus et ne peut plus être revendiqué."

const MESSAGE_REGISTRE_INDISPONIBLE = "Registre des Brouillons indisponible"

function makeInput(
  images: readonly (string | EntreeImageProduit)[],
  overrides: Partial<ProductInput> = {}
): ProductInput {
  const cible = overrides.slug ?? slug("base")
  return {
    name: "Produit créé avec des Brouillons",
    slug: cible,
    description: "Une description",
    brand: "Marque",
    categoryId,
    price: 10000,
    specs: {},
    images,
    isFeatured: false,
    featuredOrder: 0,
    freeShipping: false,
    variants: [
      { name: "Standard", sku: `SKU-${cible}`, priceDelta: 0, stock: 2 },
    ],
    ...overrides,
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
  if (!resultat.ok) throw new Error("La demande de Brouillon devait réussir")
  return resultat
}

function creerEnvironnementMemoire() {
  const horloge = creerHorlogeControllable(dateInitiale)
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreImageProduitMemoire(() =>
    horloge.horloge.maintenant()
  )
  const cycleVie = creerCycleVieImageProduit({
    stockage,
    registre,
    horloge: horloge.horloge,
  })
  const effets: CatalogEffects = {
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    preparerPromotion: cycleVie.preparerPromotionBrouillons,
    confirmerPromotion: (productId, promotions) =>
      cycleVie.confirmerBrouillons(productId, promotions),
    compenserPromotion: cycleVie.compenserPromotionBrouillons,
    supprimerSources: cycleVie.supprimerSources,
    lireBrouillonsDeLaTentative: cycleVie.lireBrouillonsDeLaTentative,
    horloge: horloge.horloge,
  }
  return { cycleVie, horloge, stockage, registre, effets }
}

function creerEnvironnementDurable(
  horloge: Horloge = { maintenant: () => new Date(dateInitiale) }
) {
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreBrouillonImageProduitPrisma(horloge)
  const cycleVie = creerCycleVieImageProduit({ stockage, registre, horloge })
  const effets: CatalogEffects = {
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    preparerPromotion: cycleVie.preparerPromotionBrouillons,
    confirmerPromotion: cycleVie.confirmerBrouillons,
    compenserPromotion: cycleVie.compenserPromotionBrouillons,
    supprimerSources: cycleVie.supprimerSources,
    lireBrouillonsDeLaTentative: cycleVie.lireBrouillonsDeLaTentative,
    horloge,
  }
  return { cycleVie, stockage, effets }
}

function copieBrouillons(
  records: ReadonlyMap<string, BrouillonImageProduit>
): Map<string, BrouillonImageProduit> {
  return new Map(
    [...records].map(([id, brouillonEnregistre]) => [
      id,
      { ...brouillonEnregistre },
    ])
  )
}

describe("création d'un Produit avec des Brouillons d'Image produit", () => {
  beforeAll(async () => {
    await prisma.user.create({
      data: {
        id: ownerId,
        name: "Éditeur Création",
        email: `creation-brouillons-${runId}@example.test`,
        role: "admin",
      },
    })
    await prisma.category.create({
      data: {
        id: categoryId,
        name: "Catégorie Création",
        slug: `cat-${runId}`,
      },
    })
  })

  beforeEach(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `p-creation-brouillons-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.brouillonImageProduit.deleteMany({ where: { ownerId } })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `p-creation-brouillons-${runId}-` } },
    })
    await prisma.category.deleteMany({ where: { id: categoryId } })
    await prisma.user.deleteMany({ where: { id: ownerId } })
    await prisma.$disconnect()
  })

  it("enregistre une Galerie mêlant Brouillons et URLs existantes dans l'ordre soumis", async () => {
    const environnement = creerEnvironnementMemoire()
    const premier = await demander(environnement.cycleVie)
    const second = await demander(environnement.cycleVie, "image/png")
    const avant = "https://cdn.test/produits/persistee-1.webp"
    const apres = "https://cdn.test/produits/persistee-2.webp"
    const urlPremier = urlImagePersistee(premier.draftId, "image/webp")
    const urlSecond = urlImagePersistee(second.draftId, "image/png")
    const cible = slug("galerie-mixte")

    const product = await createProduct(
      makeInput(
        [
          persistee(avant),
          brouillon(premier.draftId),
          persistee(apres),
          brouillon(second.draftId),
        ],
        { slug: cible, tentativeId: "tentative-mixte", ownerId }
      ),
      environnement.effets
    )

    expect(product.images).toEqual([avant, urlPremier, apres, urlSecond])
    expect(product.variants).toHaveLength(1)
    expect(product.category?.id).toBe(categoryId)

    const persiste = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      include: { variants: true },
    })
    expect(persiste.images).toEqual([avant, urlPremier, apres, urlSecond])
    expect(persiste.variants.map((variante) => variante.sku)).toEqual([
      `SKU-${cible}`,
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

  it("lie les Brouillons au Produit dans la transaction qui l'insère", async () => {
    const environnement = creerEnvironnementDurable()
    const draft = await demander(environnement.cycleVie)
    const cible = slug("liaison")
    const effets: CatalogEffects = {
      ...environnement.effets,
      confirmerPromotion: async (...confirmation) => {
        await environnement.cycleVie.confirmerBrouillons(...confirmation)
        throw new Error("échec après la liaison")
      },
    }

    await expect(
      createProduct(
        makeInput([brouillon(draft.draftId)], {
          slug: cible,
          tentativeId: "tentative-liaison",
          ownerId,
        }),
        effets
      )
    ).rejects.toThrow("échec après la liaison")

    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: draft.draftId },
      })
    ).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.stockage.suppressionsBrouillons).toEqual([])
  })

  it("supprime les sources, puis réindexe et invalide le cache après l'engagement", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    const cible = slug("apres-engagement")
    const ordre: string[] = []
    const observation = { produitVisible: false }
    const effets: CatalogEffects = {
      ...environnement.effets,
      supprimerSources: async (promotions) => {
        ordre.push("sources")
        await environnement.cycleVie.supprimerSources(promotions)
      },
      reindexProducts: async () => {
        ordre.push("index")
        observation.produitVisible =
          (await prisma.product.count({ where: { slug: cible } })) === 1
      },
      revalidateCatalog: () => {
        ordre.push("cache")
      },
    }

    const product = await createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-apres-engagement",
        ownerId,
      }),
      effets
    )

    expect(ordre).toEqual(["sources", "index", "cache"])
    expect(observation.produitVisible).toBe(true)
    expect(product.slug).toBe(cible)
    expect(environnement.stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
  })

  it("rend le Produit existant à la resoumission du même identifiant de tentative", async () => {
    const environnement = creerEnvironnementMemoire()
    const premier = await demander(environnement.cycleVie)
    const second = await demander(environnement.cycleVie)
    const confirmation = vi.fn(
      (productId: string, promotions: readonly PreuvePromotion[]) =>
        environnement.cycleVie.confirmerBrouillons(productId, promotions)
    )
    const effets: CatalogEffects = {
      ...environnement.effets,
      confirmerPromotion: confirmation,
    }
    const entree = makeInput(
      [brouillon(premier.draftId), brouillon(second.draftId)],
      { slug: slug("reprise"), tentativeId: "tentative-reprise", ownerId }
    )

    const product = await createProduct(entree, effets)
    const promotions = [...environnement.stockage.promotions]
    const sources = [...environnement.stockage.suppressionsBrouillons]
    const brouillons = copieBrouillons(environnement.registre.records)
    const ecrits = await prisma.product.count({ where: { slug: entree.slug } })

    const reprise = await createProduct(entree, effets)

    expect(reprise.id).toBe(product.id)
    expect(reprise.variants.map((variante) => variante.id)).toEqual(
      product.variants.map((variante) => variante.id)
    )
    expect(reprise.category?.id).toBe(categoryId)
    expect(await prisma.product.count({ where: { slug: entree.slug } })).toBe(
      ecrits
    )
    expect(confirmation).toHaveBeenCalledOnce()
    expect(environnement.stockage.promotions).toEqual(promotions)
    expect(environnement.stockage.suppressionsBrouillons).toEqual(sources)
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
    expect(copieBrouillons(environnement.registre.records)).toEqual(brouillons)
  })

  it("refuse de reprendre quand tous les Brouillons soumis ne sont pas liés", async () => {
    const environnement = creerEnvironnementMemoire()
    const premier = await demander(environnement.cycleVie)
    const second = await demander(environnement.cycleVie)
    const cible = slug("reprise-partielle")
    const entree = makeInput([brouillon(premier.draftId)], {
      slug: cible,
      tentativeId: "tentative-reprise-partielle",
      ownerId,
    })
    await createProduct(entree, environnement.effets)

    const promesse = createProduct(
      makeInput([brouillon(premier.draftId), brouillon(second.draftId)], {
        slug: cible,
        tentativeId: "tentative-reprise-partielle",
        ownerId,
        variants: [
          {
            name: "Standard",
            sku: `SKU-${runId}-reprise-partielle`,
            priceDelta: 0,
            stock: 2,
          },
        ],
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftConflictError)
    await expect(promesse).rejects.toThrow(
      "Les Brouillons ne sont pas tous liés à la même tentative"
    )
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(1)
    expect(
      environnement.stockage.promotions.map(({ draftId }) => draftId)
    ).toEqual([premier.draftId])
    expect(environnement.registre.records.get(second.draftId)?.state).toBe(
      "vivant"
    )
  })

  it("ne touche à aucune couture de Brouillon quand la Galerie n'en porte aucun", async () => {
    const couture = vi.fn(async (): Promise<never> => {
      throw new Error("couture de Brouillon atteinte")
    })
    const effets: Partial<CatalogEffects> = {
      preparerPromotion: couture,
      confirmerPromotion: couture,
      compenserPromotion: couture,
      supprimerSources: couture,
      lireBrouillonsDeLaTentative: couture,
      reindexProducts: vi.fn(async () => {}),
      revalidateCatalog: vi.fn(),
    }
    const avant = "https://cdn.test/produits/nue-1.webp"
    const apres = persistee("https://cdn.test/produits/nue-2.webp")

    const product = await createProduct(
      makeInput([avant, apres], { slug: slug("sans-brouillon") }),
      effets
    )

    expect(couture).not.toHaveBeenCalled()
    expect(product.images).toEqual([
      "https://cdn.test/produits/nue-1.webp",
      "https://cdn.test/produits/nue-2.webp",
    ])
  })

  it("compense la promotion quand la transaction échoue, sans laisser d'actif orphelin", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    const cible = slug("transaction-echouee")
    const entree = makeInput([brouillon(draft.draftId)], {
      slug: cible,
      tentativeId: "tentative-transaction-echouee",
      ownerId,
      categoryId: randomUUID(),
    })

    const promesse = createProduct(entree, environnement.effets)

    await expect(promesse).rejects.toThrow()
    await expect(promesse).rejects.not.toBeInstanceOf(UserFacingError)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(
      environnement.stockage.promotions.map(({ draftId }) => draftId)
    ).toEqual([draft.draftId])
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.stockage.suppressionsBrouillons).toEqual([])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
  })

  it("refuse un slug déjà pris en refus typé, sans laisser d'actif orphelin", async () => {
    const environnement = creerEnvironnementMemoire()
    const cible = slug("slug-pris")
    await createProduct(makeInput([], { slug: cible }), environnement.effets)
    const draft = await demander(environnement.cycleVie)
    const entree = makeInput([brouillon(draft.draftId)], {
      slug: cible,
      tentativeId: "tentative-slug-pris",
      ownerId,
      variants: [
        {
          name: "Standard",
          sku: `SKU-${runId}-slug-pris`,
          priceDelta: 0,
          stock: 2,
        },
      ],
    })

    const promesse = createProduct(entree, environnement.effets)

    await expect(promesse).rejects.toBeInstanceOf(SlugConflictError)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(1)
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
    })
  })

  it("refuse un Brouillon expiré en refus typé, sans rien insérer", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    environnement.horloge.avancer(25 * 60 * 60)
    const cible = slug("expire")
    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-expiree",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftExpiredError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_BROUILLON_EXPIRE)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
    expect(environnement.registre.records.get(draft.draftId)?.state).toBe(
      "expiré"
    )
  })

  it("refuse un Brouillon revendiqué par une autre tentative en refus typé", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    await environnement.registre.revendiquer({
      id: draft.draftId,
      ownerId,
      tentativeId: "tentative-rivale",
      now: dateInitiale,
    })
    const cible = slug("conflit")
    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-conflit",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftConflictError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_CONFLIT_REVENDICATION)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-rivale",
      productId: null,
    })
  })

  it("remonte un stockage indisponible puis un stockage refusé en refus typés", async () => {
    for (const panne of ["indisponible", "refuse"] as const) {
      const environnement = creerEnvironnementMemoire()
      const draft = await demander(environnement.cycleVie)
      if (panne === "indisponible") {
        environnement.stockage.pannes.promouvoirBrouillon.add("non-configure")
      } else {
        environnement.stockage.failPromotion = true
      }
      const cible = slug(`stockage-${panne}`)
      const promesse = createProduct(
        makeInput([brouillon(draft.draftId)], {
          slug: cible,
          tentativeId: `tentative-stockage-${panne}`,
          ownerId,
        }),
        environnement.effets
      )

      await expect(promesse).rejects.toBeInstanceOf(
        ImageStorageUnavailableError
      )
      await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
      expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
      expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
        state: "vivant",
        tentativeId: null,
        productId: null,
      })
    }
  })

  it("remonte un registre indisponible au moment de revendiquer", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    environnement.registre.pannes.add("revendiquer")
    const cible = slug("registre-revendication")
    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-registre",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftRegistryUnavailableError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_REGISTRE_INDISPONIBLE)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
  })

  it("remonte un registre indisponible au moment de la reprise", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    environnement.registre.pannes.add("lireParTentative")
    const cible = slug("registre-reprise")
    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-registre-reprise",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftRegistryUnavailableError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_REGISTRE_INDISPONIBLE)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
  })

  it("refuse un Brouillon sans identifiants en refus typé, sans toucher à la couture", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    const cible = slug("sans-identifiants")
    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], { slug: cible }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftPromotionRefusedError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_IDENTIFIANTS_INVALIDES)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
    expect(environnement.registre.records.get(draft.draftId)?.state).toBe(
      "vivant"
    )
  })

  it("refuse un Brouillon libéré en conflit typé, avec la raison du relâchement", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    expect(
      await environnement.cycleVie.relacherBrouillon({
        draftId: draft.draftId,
        ownerId,
      })
    ).toEqual({ ok: true, draftId: draft.draftId })
    const cible = slug("libere")

    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-liberee",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftConflictError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_BROUILLON_DEJA_LIBERE)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
    expect(environnement.registre.records.get(draft.draftId)?.state).toBe(
      "libéré"
    )
  })

  it("laisse intact un Brouillon resté hors de la Galerie soumise", async () => {
    const environnement = creerEnvironnementMemoire()
    const premier = await demander(environnement.cycleVie, "image/webp")
    const second = await demander(environnement.cycleVie, "image/png")
    const abandonne = await demander(environnement.cycleVie, "image/avif")
    const gardeeAvant = "https://cdn.test/produits/gardee-1.webp"
    const gardeeApres = "https://cdn.test/produits/gardee-2.webp"
    const cible = slug("hors-galerie")

    const product = await createProduct(
      makeInput(
        [
          persistee(gardeeAvant),
          brouillon(premier.draftId),
          persistee(gardeeApres),
          brouillon(second.draftId),
        ],
        { slug: cible, tentativeId: "tentative-hors-galerie", ownerId }
      ),
      environnement.effets
    )

    expect(product.images).toEqual([
      gardeeAvant,
      urlImagePersistee(premier.draftId, "image/webp"),
      gardeeApres,
      urlImagePersistee(second.draftId, "image/png"),
    ])
    expect(environnement.stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(premier.draftId, "image/webp"),
      draftObjectKey(second.draftId, "image/png"),
    ])
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
    expect(environnement.stockage.suppressionsImagesPersistees).toEqual([])
    expect(environnement.effets.deleteImages).not.toHaveBeenCalled()
    expect(environnement.registre.records.get(abandonne.draftId)).toMatchObject(
      {
        state: "vivant",
        tentativeId: null,
        productId: null,
        promotedPublicUrl: null,
      }
    )
  })

  it("ne laisse qu'une création concurrente gagner la revendication du même Brouillon", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    const entree = (suffixe: string) =>
      makeInput([brouillon(draft.draftId)], {
        slug: slug(suffixe),
        tentativeId: `tentative-${suffixe}`,
        ownerId,
      })

    const issues = await Promise.allSettled([
      createProduct(entree("concurrente-1"), environnement.effets),
      createProduct(entree("concurrente-2"), environnement.effets),
    ])
    const gagnant = issues.find((issue) => issue.status === "fulfilled")
    const perdant = issues.find((issue) => issue.status === "rejected")
    if (gagnant?.status !== "fulfilled" || perdant?.status !== "rejected") {
      throw new Error("Une création devait gagner et l'autre être refusée")
    }

    expect(perdant.reason).toBeInstanceOf(DraftConflictError)
    expect(perdant.reason).toBeInstanceOf(UserFacingError)
    expect(perdant.reason).toMatchObject({
      message: MESSAGE_CONFLIT_REVENDICATION,
    })
    const promue = urlImagePersistee(draft.draftId, "image/webp")
    const persiste = await prisma.product.findUniqueOrThrow({
      where: { id: gagnant.value.id },
      select: { images: true },
    })
    expect(persiste.images).toEqual([promue])
    expect(
      await prisma.product.count({
        where: { slug: { startsWith: `${slug("concurrente")}` } },
      })
    ).toBe(1)
    expect(
      environnement.stockage.promotions.map(({ draftId }) => draftId)
    ).toEqual([draft.draftId])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "revendiqué",
      productId: gagnant.value.id,
      promotedPublicUrl: promue,
    })
  })

  it("accepte la dernière milliseconde de rétention et refuse l'instant exact", async () => {
    const horloge = creerHorlogeControllable(dateInitiale)
    const environnement = creerEnvironnementDurable(horloge.horloge)
    const premier = await demander(environnement.cycleVie)
    const second = await demander(environnement.cycleVie)
    const cibleGagnante = slug("frontiere-gagnante")
    const cibleExpiree = slug("frontiere-expiree")

    horloge.fixer(new Date(premier.expiresAt.getTime() - 1))
    const product = await createProduct(
      makeInput([brouillon(premier.draftId)], {
        slug: cibleGagnante,
        tentativeId: "tentative-frontiere-gagnante",
        ownerId,
      }),
      environnement.effets
    )
    expect(product.images).toEqual([
      urlImagePersistee(premier.draftId, "image/webp"),
    ])

    horloge.fixer(second.expiresAt)
    const promesse = createProduct(
      makeInput([brouillon(second.draftId)], {
        slug: cibleExpiree,
        tentativeId: "tentative-frontiere-expiree",
        ownerId,
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toBeInstanceOf(DraftExpiredError)
    await expect(promesse).rejects.toBeInstanceOf(UserFacingError)
    await expect(promesse).rejects.toThrow(MESSAGE_BROUILLON_EXPIRE)
    expect(await prisma.product.count({ where: { slug: cibleExpiree } })).toBe(
      0
    )
    expect(
      environnement.stockage.promotions.map(({ draftId }) => draftId)
    ).toEqual([premier.draftId])
    expect(environnement.stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(premier.draftId, "image/webp"),
    ])
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: second.draftId },
        select: { state: true, productId: true, promotedPublicUrl: true },
      })
    ).toEqual({ state: "expiré", productId: null, promotedPublicUrl: null })
  })

  it("rend le Produit déjà lié à la resoumission, même après l'expiration de la rétention", async () => {
    const horloge = creerHorlogeControllable(dateInitiale)
    const environnement = creerEnvironnementDurable(horloge.horloge)
    const draft = await demander(environnement.cycleVie)
    const cible = slug("reprise-durable")
    const entree = makeInput([brouillon(draft.draftId)], {
      slug: cible,
      tentativeId: "tentative-reprise-durable",
      ownerId,
    })

    const product = await createProduct(entree, environnement.effets)
    const promotions = [...environnement.stockage.promotions]
    const sources = [...environnement.stockage.suppressionsBrouillons]

    horloge.avancer(48 * 60 * 60)
    const reprise = await createProduct(entree, environnement.effets)

    expect(reprise.id).toBe(product.id)
    const promue = urlImagePersistee(draft.draftId, "image/webp")
    expect(reprise.images).toEqual([promue])
    expect(environnement.stockage.promotions).toEqual(promotions)
    expect(environnement.stockage.suppressionsBrouillons).toEqual(sources)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(1)
    expect(
      await prisma.brouillonImageProduit.findUniqueOrThrow({
        where: { id: draft.draftId },
      })
    ).toMatchObject({
      state: "revendiqué",
      tentativeId: "tentative-reprise-durable",
      productId: product.id,
      promotedPublicUrl: promue,
    })
  })

  it("garde les liens du registre durable dans la transaction qui insère le Produit", async () => {
    const environnement = creerEnvironnementDurable()
    const premier = await demander(environnement.cycleVie, "image/jpeg")
    const second = await demander(environnement.cycleVie, "image/png")
    const cible = slug("liaison-durable")

    const product = await createProduct(
      makeInput([brouillon(premier.draftId), brouillon(second.draftId)], {
        slug: cible,
        tentativeId: "tentative-liaison-durable",
        ownerId,
      }),
      environnement.effets
    )

    const urls = [
      urlImagePersistee(premier.draftId, "image/jpeg"),
      urlImagePersistee(second.draftId, "image/png"),
    ]
    expect(product.images).toEqual(urls)
    const persiste = await prisma.product.findUniqueOrThrow({
      where: { id: product.id },
      select: { images: true },
    })
    expect(persiste.images).toEqual(urls)
    for (const [index, draft] of [premier, second].entries()) {
      expect(
        await prisma.brouillonImageProduit.findUniqueOrThrow({
          where: { id: draft.draftId },
        })
      ).toMatchObject({
        state: "revendiqué",
        tentativeId: "tentative-liaison-durable",
        productId: product.id,
        promotedPublicUrl: urls[index],
      })
    }
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
  })

  it("rend les revendications déjà posées quand le registre tombe, puis réussit à son retour", async () => {
    const environnement = creerEnvironnementMemoire()
    const premier = await demander(environnement.cycleVie, "image/webp")
    const second = await demander(environnement.cycleVie, "image/png")
    const revendiquer = environnement.registre.revendiquer.bind(
      environnement.registre
    )
    environnement.registre.revendiquer = async (input) => {
      if (input.id === second.draftId) {
        throw new Error("registre indisponible")
      }
      return revendiquer(input)
    }
    const cible = slug("registre-partiel")
    const entree = makeInput(
      [brouillon(premier.draftId), brouillon(second.draftId)],
      { slug: cible, tentativeId: "tentative-registre-partiel", ownerId }
    )

    const echec = createProduct(entree, environnement.effets)

    await expect(echec).rejects.toBeInstanceOf(DraftRegistryUnavailableError)
    await expect(echec).rejects.toBeInstanceOf(UserFacingError)
    await expect(echec).rejects.toThrow(MESSAGE_REGISTRE_INDISPONIBLE)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.promotions).toEqual([])
    for (const draft of [premier, second]) {
      expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
        state: "vivant",
        tentativeId: null,
        productId: null,
      })
    }

    environnement.registre.revendiquer = revendiquer
    const retry = await createProduct(entree, environnement.effets)

    expect(retry.images).toEqual([
      urlImagePersistee(premier.draftId, "image/webp"),
      urlImagePersistee(second.draftId, "image/png"),
    ])
    expect(
      environnement.stockage.promotions.map(({ draftId }) => draftId)
    ).toEqual([premier.draftId, second.draftId])
  })

  it("garde l'enregistrement acquis quand la suppression d'une source échoue", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    const preuve = creerStockageImageProduitMemoire()
    preuve.pannes.supprimerBrouillon.add("leve")
    await expect(
      preuve.supprimerBrouillon({
        draftId: draft.draftId,
        contentType: "image/webp",
      })
    ).rejects.toThrow("supprimerBrouillon")
    environnement.stockage.pannes.supprimerBrouillon.add("leve")
    const cible = slug("source-en-echec")

    const product = await createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-source-en-echec",
        ownerId,
      }),
      environnement.effets
    )

    expect(product.images).toEqual([
      urlImagePersistee(draft.draftId, "image/webp"),
    ])
    expect(environnement.stockage.suppressionsBrouillons).toEqual([
      draftObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(1)
  })

  it("rend le refus typé même quand la compensation ne peut pas supprimer la copie promue", async () => {
    const environnement = creerEnvironnementMemoire()
    const draft = await demander(environnement.cycleVie)
    const preuve = creerStockageImageProduitMemoire()
    preuve.pannes.supprimerImagePromue.add("leve")
    await expect(
      preuve.supprimerImagePromue({
        draftId: draft.draftId,
        contentType: "image/webp",
      })
    ).rejects.toThrow("supprimerImagePromue")
    environnement.stockage.pannes.supprimerImagePromue.add("leve")
    const cible = slug("compensation-en-echec")

    const promesse = createProduct(
      makeInput([brouillon(draft.draftId)], {
        slug: cible,
        tentativeId: "tentative-compensation-en-echec",
        ownerId,
        categoryId: randomUUID(),
      }),
      environnement.effets
    )

    await expect(promesse).rejects.toThrow()
    await expect(promesse).rejects.not.toBeInstanceOf(UserFacingError)
    expect(await prisma.product.count({ where: { slug: cible } })).toBe(0)
    expect(environnement.stockage.suppressionsImagesPromues).toEqual([
      persistentObjectKey(draft.draftId, "image/webp"),
    ])
    expect(environnement.registre.records.get(draft.draftId)).toMatchObject({
      state: "vivant",
      tentativeId: null,
      productId: null,
      promotedPublicUrl: null,
    })
  })
})
