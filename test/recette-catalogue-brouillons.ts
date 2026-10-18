import { vi } from "vitest"

import {
  creerCycleVieImageProduit,
  creerRegistreBrouillonImageProduitPrisma,
  type BrouillonImageProduit,
  type CycleVieImageProduit,
  type Horloge,
} from "@/lib/cycle-vie-image-produit"
import { prisma } from "@/lib/db"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
import type {
  CatalogEffects,
  ProductInput,
  ProductVariantInput,
} from "@/lib/use-cases/admin-catalog"
import {
  creerHorlogeControllable,
  creerRegistreImageProduitMemoire,
  creerStockageImageProduitMemoire,
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
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    preparerPromotionBrouillons: cycleVie.preparerPromotionBrouillons,
    confirmerBrouillons: (productId, promotions) =>
      cycleVie.confirmerBrouillons(productId, promotions),
    compenserPromotionBrouillons: cycleVie.compenserPromotionBrouillons,
    supprimerSources: cycleVie.supprimerSources,
    lireBrouillonsDeLaTentative: cycleVie.lireBrouillonsDeLaTentative,
    horloge: horloge.horloge,
  }
  return { cycleVie, horloge, stockage, registre, effets }
}

export function creerEnvironnementDurable(horloge: Horloge) {
  const stockage = creerStockageImageProduitMemoire()
  const registre = creerRegistreBrouillonImageProduitPrisma(horloge)
  const cycleVie = creerCycleVieImageProduit({ stockage, registre, horloge })
  const effets: CatalogEffects = {
    deleteImages: vi.fn(async () => {}),
    reindexProducts: vi.fn(async () => {}),
    revalidateCatalog: vi.fn(),
    removeProductFromIndex: vi.fn(async () => {}),
    preparerPromotionBrouillons: cycleVie.preparerPromotionBrouillons,
    confirmerBrouillons: cycleVie.confirmerBrouillons,
    compenserPromotionBrouillons: cycleVie.compenserPromotionBrouillons,
    supprimerSources: cycleVie.supprimerSources,
    lireBrouillonsDeLaTentative: cycleVie.lireBrouillonsDeLaTentative,
    horloge,
  }
  return { cycleVie, stockage, effets }
}

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
    preparerPromotionBrouillons: async (entree) => {
      jalons.ordre.push("preparation")
      return effets.preparerPromotionBrouillons(entree)
    },
    confirmerBrouillons: async (...confirmation) => {
      jalons.ordre.push(
        jalons.estOuverte() ? "liaison" : "liaison-hors-transaction"
      )
      return effets.confirmerBrouillons(...confirmation)
    },
    supprimerSources: async (promotions) => {
      jalons.ordre.push(
        jalons.estOuverte() ? "sources-dans-la-transaction" : "sources"
      )
      return effets.supprimerSources(promotions)
    },
  }
}
