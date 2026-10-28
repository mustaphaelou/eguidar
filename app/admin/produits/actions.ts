"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  CHAMPS_FORMULAIRE_PRODUIT,
  sectionsDerreurProduit,
  soumissionDepuisFormData,
  type EtatFormulaireProduit,
  type SoumissionFormulaireProduit,
} from "@/lib/formulaire-produit"
import {
  bulkDelete,
  bulkSetFeatured,
  bulkSetFreeShipping,
  bulkSetStructure,
  createProduct,
  deleteProduct,
  duplicateProduct,
  updateProduct,
  updateVariantStock,
} from "@/lib/use-cases/admin-catalog"
import {
  CHAMP_STRUCTURE_LOT,
  CHAMP_VALEUR_LOT,
  parseIdentifiantsLot,
  parseStructureLot,
  parseValeurLot,
  type RapportLot,
} from "@/lib/produit-bulk"
import {
  adminFormAction,
  adminTaskAction,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

interface ProductUpdateInput extends SoumissionFormulaireProduit {
  productId: string
}

function basePubliqueImageProduit(): string | null {
  return process.env.R2_PUBLIC_URL ?? null
}

function etatDerreurProduit(error: UserFacingError): EtatFormulaireProduit {
  return {
    error: error.message,
    sections: sectionsDerreurProduit(error.message),
  }
}

export const createProductAction = adminFormAction<
  SoumissionFormulaireProduit,
  EtatFormulaireProduit
>({
  next: "/admin/produits",
  parse: (formData) =>
    soumissionDepuisFormData(formData, basePubliqueImageProduit()),
  run: async ({ champsCatalogue, images, tentativeId }, client) => {
    try {
      const product = await createProduct({
        ...champsCatalogue,
        images,
        tentativeId,
        ownerId: client.id,
      })

      redirect(`/admin/produits/${product.id}`)
    } catch (error) {
      if (error instanceof UserFacingError) return etatDerreurProduit(error)
      throw error
    }
  },
})

export const updateProductAction = adminFormAction<
  ProductUpdateInput,
  EtatFormulaireProduit
>({
  next: "/admin/produits",
  parse: (formData) => ({
    ...soumissionDepuisFormData(formData, basePubliqueImageProduit()),
    productId: parseRequiredId(formData, CHAMPS_FORMULAIRE_PRODUIT.produit),
  }),
  run: async ({ productId, champsCatalogue, images, tentativeId }, client) => {
    try {
      await updateProduct(productId, {
        ...champsCatalogue,
        images,
        tentativeId,
        ownerId: client.id,
      })

      redirect("/admin/produits")
    } catch (error) {
      if (error instanceof UserFacingError) return etatDerreurProduit(error)
      throw error
    }
  },
})

export const deleteProductAction = adminTaskAction<{ productId: string }>({
  next: "/admin/produits",
  parse: (formData) => ({
    productId: parseRequiredId(formData, CHAMPS_FORMULAIRE_PRODUIT.produit),
  }),
  refusalUrl: () => "/admin/produits",
  run: async ({ productId }) => {
    await deleteProduct(productId)
    redirect("/admin/produits")
  },
})

export const updateVariantStockAction = adminTaskAction<{
  variantId: string
  stock: number
}>({
  next: "/admin/produits",
  parse: (formData) => ({
    variantId: parseRequiredId(formData, "variantId"),
    stock: Number(formData.get("stock") ?? 0),
  }),
  run: async ({ variantId, stock }) => {
    await updateVariantStock(variantId, stock)
  },
})

export interface ProduitLotState {
  error?: string
  rapport?: RapportLot
}

const LISTE_PRODUITS = "/admin/produits"

export const bulkSetStructureAction = adminFormAction<
  { ids: string[]; structureId: string },
  ProduitLotState
>({
  next: LISTE_PRODUITS,
  parse: (formData) => ({
    ids: parseIdentifiantsLot(formData),
    structureId: parseStructureLot(formData),
  }),
  run: async ({ ids, structureId }) => {
    const rapport = await bulkSetStructure(ids, structureId)
    revalidatePath(LISTE_PRODUITS)
    return { rapport }
  },
})

export const bulkSetFeaturedAction = adminFormAction<
  { ids: string[]; valeur: boolean },
  ProduitLotState
>({
  next: LISTE_PRODUITS,
  parse: (formData) => ({
    ids: parseIdentifiantsLot(formData),
    valeur: parseValeurLot(formData),
  }),
  run: async ({ ids, valeur }) => {
    const rapport = await bulkSetFeatured(ids, valeur)
    revalidatePath(LISTE_PRODUITS)
    return { rapport }
  },
})

export const bulkSetFreeShippingAction = adminFormAction<
  { ids: string[]; valeur: boolean },
  ProduitLotState
>({
  next: LISTE_PRODUITS,
  parse: (formData) => ({
    ids: parseIdentifiantsLot(formData),
    valeur: parseValeurLot(formData),
  }),
  run: async ({ ids, valeur }) => {
    const rapport = await bulkSetFreeShipping(ids, valeur)
    revalidatePath(LISTE_PRODUITS)
    return { rapport }
  },
})

export const bulkDeleteAction = adminFormAction<
  { ids: string[] },
  ProduitLotState
>({
  next: LISTE_PRODUITS,
  parse: (formData) => ({ ids: parseIdentifiantsLot(formData) }),
  run: async ({ ids }) => {
    const rapport = await bulkDelete(ids)
    revalidatePath(LISTE_PRODUITS)
    return { rapport }
  },
})

export const duplicateProductAction = adminFormAction<
  { ids: string[] },
  ProduitLotState
>({
  next: LISTE_PRODUITS,
  parse: (formData) => {
    const ids = parseIdentifiantsLot(formData).slice(0, 1)
    if (ids.length === 0) throw new Error("Formulaire invalide")
    return { ids }
  },
  run: async ({ ids }) => {
    const copie = await duplicateProduct(ids[0]!)
    revalidatePath(LISTE_PRODUITS)
    return { rapport: { succes: [copie.id], echecs: [] } }
  },
})

export const CHAMPS_LOT = {
  ids: "ids",
  valeur: CHAMP_VALEUR_LOT,
  structure: CHAMP_STRUCTURE_LOT,
} as const
