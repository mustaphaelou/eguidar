import { expect, vi } from "vitest"

import {
  creerCycleVieImageProduit,
  creerRegistreBrouillonImageProduitPrisma,
  MESSAGE_REGISTRE_INDISPONIBLE,
  type BrouillonImageProduit,
  type ContentTypeImageProduit,
  type CycleVieImageProduit,
  type Horloge,
  type PreuvePromotion,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import { persistentObjectKey } from "@/lib/r2"
import {
  DraftConflictError,
  DraftExpiredError,
  DraftPromotionRefusedError,
  DraftRegistryUnavailableError,
  ImageStorageUnavailableError,
  type CatalogEffects,
  type ProductInput,
  type ProductVariantInput,
} from "@/lib/use-cases/admin-catalog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
  type OperationRegistre,
  type StockageImageProduitMemoire,
} from "@/test/cycle-vie-image-produit-memoire"

export const MESSAGE_IDENTIFIANTS_INVALIDES =
  "Tentative d'édition ou propriétaire invalide"

export const MESSAGE_BROUILLON_EXPIRE =
  "Ce Brouillon d'Image produit a expiré et son fichier peut déjà avoir été supprimé du stockage. Téléversez à nouveau l'image."

export const MESSAGE_CONFLIT_REVENDICATION =
  "Ce Brouillon d'Image produit est déjà utilisé par une autre tentative d'enregistrement. Rechargez le formulaire ou retirez-le de la galerie."

export const MESSAGE_BROUILLON_DEJA_LIBERE =
  "Ce Brouillon d'Image produit a déjà été libéré : il n'existe plus et ne peut plus être revendiqué."

export function horlogeFixe(date: Date): Horloge {
  return { maintenant: () => new Date(date) }
}

export function creerDemandeurDeBrouillon(ownerId: string) {
  return async function demander(
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
}

export function creerEnvironnementMemoire(dateInitiale: Date) {
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
    cycleVie: {
      ...cycleVie,
      confirmerBrouillons: (productId, promotions) =>
        cycleVie.confirmerBrouillons(productId, promotions),
    },
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    enregistrerImages: vi.fn(async () => {}),
  }
  return { cycleVie, horloge, stockage, registre, effets }
}

export function creerEnvironnementDurable(horloge: Horloge) {
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreBrouillonImageProduitPrisma(horloge)
  const cycleVie = creerCycleVieImageProduit({ stockage, registre, horloge })
  const effets: CatalogEffects = {
    cycleVie,
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    enregistrerImages: vi.fn(async () => {}),
  }
  return { cycleVie, stockage, effets }
}

export type EnvironnementMemoire = ReturnType<typeof creerEnvironnementMemoire>

export function copieBrouillons(
  records: ReadonlyMap<string, BrouillonImageProduit>
): Map<string, BrouillonImageProduit> {
  return new Map(
    [...records].map(([id, brouillonEnregistre]) => [
      id,
      { ...brouillonEnregistre },
    ])
  )
}

export interface DefautsEntreeProduit {
  name: string
  description: string
  slug: () => string
  variants: (slugEffectif: string) => ProductVariantInput[]
}

export function creerEntreeProduit(
  categoryId: string,
  defauts: DefautsEntreeProduit
) {
  return function entree(
    images: readonly (string | EntreeImageProduit)[],
    overrides: Partial<ProductInput> = {}
  ): ProductInput {
    const slugEffectif = overrides.slug ?? defauts.slug()
    return {
      name: defauts.name,
      slug: slugEffectif,
      description: defauts.description,
      brand: "Marque",
      categoryId,
      price: 10000,
      specs: {},
      images,
      isFeatured: false,
      featuredOrder: 0,
      freeShipping: false,
      variants: defauts.variants(slugEffectif),
      ...overrides,
    }
  }
}

export interface JalonsDeLaTransaction {
  readonly ordre: string[]
  estOuverte(): boolean
  arreter(): void
}

export function observerLesJalonsDeLaTransaction(): JalonsDeLaTransaction {
  const ordre: string[] = []
  let ouverte = false
  const transactionReelle = prisma.$transaction.bind(prisma)
  const espion = vi
    .spyOn(prisma, "$transaction")
    .mockImplementation(async (transaction, options) => {
      ordre.push("transaction-ouverte")
      ouverte = true
      try {
        return await transactionReelle(transaction, options)
      } finally {
        ouverte = false
        ordre.push("transaction-fermee")
      }
    })

  return {
    ordre,
    estOuverte: () => ouverte,
    arreter: () => espion.mockRestore(),
  }
}

export function effetsObservantLesJalons(
  effets: CatalogEffects,
  jalons: JalonsDeLaTransaction
): CatalogEffects {
  return {
    ...effets,
    cycleVie: {
      ...effets.cycleVie,
      preparerPromotionBrouillons: async (entree) => {
        jalons.ordre.push("preparation")
        return effets.cycleVie.preparerPromotionBrouillons(entree)
      },
      confirmerBrouillons: async (...confirmation) => {
        jalons.ordre.push(
          jalons.estOuverte() ? "liaison" : "liaison-hors-transaction"
        )
        return effets.cycleVie.confirmerBrouillons(...confirmation)
      },
      supprimerSources: async (promotions) => {
        jalons.ordre.push(
          jalons.estOuverte() ? "sources-dans-la-transaction" : "sources"
        )
        return effets.cycleVie.supprimerSources(promotions)
      },
    },
  }
}

export interface BrouillonSoumis {
  draftId: string
  contentType?: ContentTypeImageProduit
}

export interface AttenteRefusCatalogue<E extends UserFacingError> {
  classe: new (...args: never[]) => E
  message?: string | RegExp
}

export async function verifierRefusCatalogue<E extends UserFacingError>(
  soumettre: () => Promise<unknown>,
  attente: AttenteRefusCatalogue<E>
): Promise<void> {
  const refus: unknown = await soumettre().then(
    () => undefined,
    (error: unknown) => error
  )
  if (!(refus instanceof attente.classe)) {
    throw new Error(
      `refus attendu : ${attente.classe.name} — reçu : ${
        refus instanceof Error ? refus.name : String(refus)
      }`
    )
  }
  expect(refus).toBeInstanceOf(UserFacingError)
  if (typeof attente.message === "string") {
    expect(refus.message).toBe(attente.message)
  } else if (attente.message !== undefined) {
    expect(refus.message).toMatch(attente.message)
  }
}

export const JALONS_DU_CYCLE_DE_PROMOTION = [
  "preparation",
  "transaction-ouverte",
  "liaison",
  "transaction-fermee",
  "sources",
] as const

export async function verifierLOrdreDesTroisPhases<P>(
  environnement: { effets: CatalogEffects },
  soumettre: (effets: CatalogEffects) => Promise<P>
): Promise<P> {
  const jalons = observerLesJalonsDeLaTransaction()
  try {
    const produit = await soumettre(
      effetsObservantLesJalons(environnement.effets, jalons)
    )
    expect(jalons.ordre).toEqual([...JALONS_DU_CYCLE_DE_PROMOTION])
    return produit
  } finally {
    jalons.arreter()
  }
}

export async function verifierAucuneCoutureDeBrouillon<
  P extends { images: unknown },
>(
  environnement: { effets: CatalogEffects },
  imagesAttendues: readonly string[],
  soumettre: (effets: CatalogEffects) => Promise<P>
): Promise<void> {
  const couture = vi.fn(async (): Promise<never> => {
    throw new Error("couture de Brouillon atteinte")
  })
  const effets: CatalogEffects = {
    ...environnement.effets,
    cycleVie: {
      ...environnement.effets.cycleVie,
      preparerPromotionBrouillons: couture,
      confirmerBrouillons: couture,
      compenserPromotionBrouillons: couture,
      supprimerSources: couture,
      lireBrouillonsDeLaTentative: couture,
    },
  }

  const produit = await soumettre(effets)

  expect(couture).not.toHaveBeenCalled()
  expect(produit.images).toEqual([...imagesAttendues])
}

export async function verifierRevendicationAilleurs(
  environnement: EnvironnementMemoire,
  ownerId: string,
  brouillon: BrouillonSoumis,
  soumettre: () => Promise<unknown>,
  tentativeRivale = "tentative-rivale"
): Promise<void> {
  await environnement.registre.revendiquer({
    id: brouillon.draftId,
    ownerId,
    tentativeId: tentativeRivale,
    now: environnement.horloge.horloge.maintenant(),
  })
  await verifierRefusCatalogue(soumettre, {
    classe: DraftConflictError,
    message: MESSAGE_CONFLIT_REVENDICATION,
  })

  expect(environnement.stockage.promotions).toEqual([])
  expect(environnement.registre.records.get(brouillon.draftId)).toMatchObject({
    state: "revendiqué",
    tentativeId: tentativeRivale,
    productId: null,
  })
}

export async function verifierRefusSansIdentifiants(
  environnement: EnvironnementMemoire,
  brouillon: BrouillonSoumis,
  soumettre: () => Promise<unknown>
): Promise<void> {
  await verifierRefusCatalogue(soumettre, {
    classe: DraftPromotionRefusedError,
    message: MESSAGE_IDENTIFIANTS_INVALIDES,
  })

  expect(environnement.stockage.promotions).toEqual([])
  expect(environnement.registre.records.get(brouillon.draftId)?.state).toBe(
    "vivant"
  )
}

export const PANNES_DE_STOCKAGE = ["indisponible", "refuse"] as const

export type PanneDeStockage = (typeof PANNES_DE_STOCKAGE)[number]

function provoquerPanneDeStockage(
  stockage: StockageImageProduitMemoire,
  panne: PanneDeStockage
): void {
  if (panne === "indisponible") {
    stockage.pannes.promouvoirBrouillon.add("non-configure")
  } else {
    stockage.failPromotion = true
  }
}

export async function verifierRefusStockage(
  environnement: EnvironnementMemoire,
  brouillon: BrouillonSoumis,
  panne: PanneDeStockage,
  soumettre: () => Promise<unknown>
): Promise<void> {
  provoquerPanneDeStockage(environnement.stockage, panne)
  await verifierRefusCatalogue(soumettre, {
    classe: ImageStorageUnavailableError,
  })

  expect(environnement.registre.records.get(brouillon.draftId)).toMatchObject({
    state: "vivant",
    tentativeId: null,
    productId: null,
  })
}

export async function verifierRefusBrouillonExpire(
  environnement: EnvironnementMemoire,
  brouillon: BrouillonSoumis,
  soumettre: () => Promise<unknown>,
  avancerSecondes = 25 * 60 * 60
): Promise<void> {
  environnement.horloge.avancer(avancerSecondes)
  await verifierRefusCatalogue(soumettre, {
    classe: DraftExpiredError,
    message: MESSAGE_BROUILLON_EXPIRE,
  })

  expect(environnement.stockage.promotions).toEqual([])
  expect(environnement.registre.records.get(brouillon.draftId)?.state).toBe(
    "expiré"
  )
}

export async function verifierRefusRegistreIndisponible(
  environnement: EnvironnementMemoire,
  operation: OperationRegistre,
  soumettre: () => Promise<unknown>
): Promise<void> {
  environnement.registre.pannes.add(operation)
  await verifierRefusCatalogue(soumettre, {
    classe: DraftRegistryUnavailableError,
    message: MESSAGE_REGISTRE_INDISPONIBLE,
  })

  expect(environnement.stockage.promotions).toEqual([])
}

function typeDeContenu(brouillon: BrouillonSoumis): ContentTypeImageProduit {
  return brouillon.contentType ?? "image/webp"
}

export async function verifierCompensationSurEchecDeTransaction(
  environnement: EnvironnementMemoire,
  brouillon: BrouillonSoumis,
  soumettre: () => Promise<unknown>
): Promise<void> {
  const refus: unknown = await soumettre().then(
    () => undefined,
    (error: unknown) => error
  )
  if (refus === undefined) {
    throw new Error("L'enregistrement devait échouer sur la transaction")
  }
  expect(refus).toBeInstanceOf(Error)
  expect(refus).not.toBeInstanceOf(UserFacingError)
  expect(
    environnement.stockage.promotions.map(({ draftId }) => draftId)
  ).toEqual([brouillon.draftId])
  expect(environnement.stockage.suppressionsImagesPromues).toEqual([
    persistentObjectKey(brouillon.draftId, typeDeContenu(brouillon)),
  ])
  expect(environnement.stockage.suppressionsBrouillons).toEqual([])
  expect(environnement.registre.records.get(brouillon.draftId)).toMatchObject({
    state: "vivant",
    tentativeId: null,
    productId: null,
    promotedPublicUrl: null,
  })
}

export async function verifierRepriseSansRejeu<P extends { id: string }>(
  environnement: EnvironnementMemoire,
  soumettre: (effets: CatalogEffects) => Promise<P>
): Promise<{ premier: P; reprise: P }> {
  const confirmation = vi.fn(
    (productId: string, promotions: readonly PreuvePromotion[]) =>
      environnement.cycleVie.confirmerBrouillons(productId, promotions)
  )
  const effets: CatalogEffects = {
    ...environnement.effets,
    cycleVie: {
      ...environnement.effets.cycleVie,
      confirmerBrouillons: confirmation,
    },
  }

  const premier = await soumettre(effets)
  const promotions = [...environnement.stockage.promotions]
  const sources = [...environnement.stockage.suppressionsBrouillons]
  const brouillons = copieBrouillons(environnement.registre.records)

  const reprise = await soumettre(effets)

  expect(reprise.id).toBe(premier.id)
  expect(confirmation).toHaveBeenCalledOnce()
  expect(environnement.stockage.promotions).toEqual(promotions)
  expect(environnement.stockage.suppressionsBrouillons).toEqual(sources)
  expect(environnement.stockage.suppressionsImagesPromues).toEqual([])
  expect(copieBrouillons(environnement.registre.records)).toEqual(brouillons)
  return { premier, reprise }
}
