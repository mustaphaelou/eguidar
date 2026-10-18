"use server"

import { redirect } from "next/navigation"

import {
  soumissionDepuisFormData,
  type SoumissionFormulaireProduit,
} from "@/lib/formulaire-produit"
import {
  createProduct,
  deleteProduct,
  updateProduct,
  updateVariantStock,
} from "@/lib/use-cases/admin-catalog"
import {
  adminFormAction,
  adminTaskAction,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"

interface ProductUpdateInput extends SoumissionFormulaireProduit {
  productId: string
}

export const createProductAction = adminFormAction<SoumissionFormulaireProduit>(
  {
    next: "/admin/produits",
    parse: soumissionDepuisFormData,
    run: async ({ champsCatalogue, images, tentativeId }, client) => {
      const product = await createProduct({
        ...champsCatalogue,
        images,
        tentativeId,
        ownerId: client.id,
      })

      redirect(`/admin/produits/${product.id}`)
    },
  }
)

export const updateProductAction = adminFormAction<ProductUpdateInput>({
  next: "/admin/produits",
  parse: (formData) => ({
    ...soumissionDepuisFormData(formData),
    productId: parseRequiredId(formData, "productId"),
  }),
  run: async ({ productId, champsCatalogue, images, tentativeId }, client) => {
    await updateProduct(productId, {
      ...champsCatalogue,
      images,
      tentativeId,
      ownerId: client.id,
    })

    redirect("/admin/produits")
  },
})

export const deleteProductAction = adminTaskAction<{ productId: string }>({
  next: "/admin/produits",
  parse: (formData) => ({ productId: parseRequiredId(formData, "productId") }),
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
