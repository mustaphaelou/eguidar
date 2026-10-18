"use server"

import { redirect } from "next/navigation"

import cycleVieImageProduit from "@/lib/cycle-vie-image-produit"
import {
  soumissionDepuisFormData,
  type SoumissionFormulaireProduit,
} from "@/lib/formulaire-produit"
import {
  adminFormAction,
  adminTaskAction,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  createProduct,
  deleteProduct,
  getAdminProduct,
  updateProduct,
  updateVariantStock,
} from "@/lib/use-cases/admin-catalog"

interface ProductUpdateInput extends SoumissionFormulaireProduit {
  productId: string
}

const resultatDejaPersiste = async (productId: string) => {
  const product = await getAdminProduct(productId)
  if (!product) throw new Error("Produit enregistré introuvable")
}

export const createProductAction = adminFormAction<SoumissionFormulaireProduit>(
  {
    next: "/admin/produits",
    parse: soumissionDepuisFormData,
    run: async ({ champsCatalogue, images, tentativeId }, client) => {
      const resultat = await cycleVieImageProduit.revendiquerEtEnregistrer({
        tentativeId,
        ownerId: client.id,
        galerie: images,
        resultatDejaPersiste,
        enregistrer: async (revendication) => {
          const product = await createProduct({
            ...champsCatalogue,
            images: [...revendication.galerie],
          })
          await revendication.lier(product.id)
          return { productId: product.id }
        },
      })
      if (!resultat.ok) throw new UserFacingError(resultat.message)

      redirect(`/admin/produits/${resultat.productId}`)
    },
  }
)

export const updateProductAction = adminFormAction<ProductUpdateInput>({
  next: "/admin/produits",
  parse: (formData) => {
    return {
      ...soumissionDepuisFormData(formData),
      productId: parseRequiredId(formData, "productId"),
    }
  },
  run: async ({ productId, champsCatalogue, images, tentativeId }, client) => {
    const resultat = await cycleVieImageProduit.revendiquerEtEnregistrer({
      tentativeId,
      ownerId: client.id,
      galerie: images,
      resultatDejaPersiste,
      enregistrer: async (revendication) => {
        const product = await updateProduct(productId, {
          ...champsCatalogue,
          images: [...revendication.galerie],
        })
        await revendication.lier(product.id)
        return { productId: product.id }
      },
    })
    if (!resultat.ok) throw new UserFacingError(resultat.message)

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
