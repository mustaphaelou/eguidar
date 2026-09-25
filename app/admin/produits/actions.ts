"use server"

import { redirect } from "next/navigation"

import cycleVieImageProduit, {
  type ImageProduitPromue,
} from "@/lib/cycle-vie-image-produit"
import {
  soumissionDepuisFormData,
  type SoumissionFormulaireProduit,
} from "@/lib/formulaire-produit"
import type { EntreeImageProduit } from "@/lib/galerie-image-produit"
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

function refuserImagesPersisteesEnCreation(
  images: readonly EntreeImageProduit[]
): void {
  if (images.some((image) => image.kind === "persistee")) {
    throw new UserFacingError(
      "Une création de Produit ne peut contenir que des Brouillons d'Image produit"
    )
  }
}

function urlsPersistees(images: readonly EntreeImageProduit[]): string[] {
  return images.flatMap((image) =>
    image.kind === "persistee" ? [image.url] : []
  )
}

function identifiantsBrouillons(
  images: readonly EntreeImageProduit[]
): string[] {
  return images.flatMap((image) =>
    image.kind === "brouillon" ? [image.draftId] : []
  )
}

function urlsGalerieMiseAJour(
  images: readonly EntreeImageProduit[],
  promues: readonly ImageProduitPromue[]
): string[] {
  const promuesParDraftId = new Map(
    promues.map((image) => [image.draftId, image.publicUrl])
  )
  return images.map((image) => {
    if (image.kind === "persistee") return image.url
    const publicUrl = promuesParDraftId.get(image.draftId)
    if (publicUrl === undefined) {
      throw new Error("URL d'Image produit promue indisponible")
    }
    return publicUrl
  })
}

interface ProductUpdateInput extends SoumissionFormulaireProduit {
  productId: string
}

/**
 * Le résultat d'une opération déjà écrite : les Brouillons sont liés au
 * Produit, donc le commit Catalogue existe — on relit le Produit au lieu de
 * le créer ou le modifier une seconde fois.
 */
const resultatDejaPersiste = async (productId: string) => {
  const product = await getAdminProduct(productId)
  if (!product) throw new Error("Produit enregistré introuvable")
  return product
}

/**
 * Créer un Produit. La lecture de la soumission est celle du module neutre du
 * formulaire, seul propriétaire du format : cette action ne tient aucun
 * mapping de champ, elle passe le `FormData` et transmet ce qu'il rend.
 */
export const createProductAction = adminFormAction<SoumissionFormulaireProduit>(
  {
    next: "/admin/produits",
    parse: soumissionDepuisFormData,
    run: async ({ champs, images, tentativeId }, client) => {
      refuserImagesPersisteesEnCreation(images)
      const draftIds = identifiantsBrouillons(images)

      if (draftIds.length === 0) {
        const product = await createProduct({ ...champs, images: [] })
        redirect(`/admin/produits/${product.id}`)
      }

      const resultat = await cycleVieImageProduit.revendiquerEtEnregistrer({
        tentativeId,
        ownerId: client.id,
        draftIds,
        resultatDejaPersiste,
        enregistrer: async (promues, lier) => {
          const product = await createProduct(
            { ...champs, images: promues.map((image) => image.publicUrl) },
            undefined,
            {
              lier,
              promues: promues.map((image) => image.publicUrl),
            }
          )
          return { productId: product.id, result: product }
        },
      })
      if (!resultat.ok) throw new UserFacingError(resultat.message)

      redirect(`/admin/produits/${resultat.productId}`)
    },
  }
)

/**
 * Mettre à jour un Produit. Même lecture de la soumission, plus
 * l'identification : le `productId` caché est résolu ici, par l'aide
 * d'identifiant requis du mécanisme partagé de mutation, parce que c'est
 * cette action — et elle seule — qui sait qu'elle édite un Produit existant.
 * Le module neutre du formulaire n'apprend donc pas quelles actions ont
 * besoin d'un identifiant.
 */
export const updateProductAction = adminFormAction<ProductUpdateInput>({
  next: "/admin/produits",
  parse: (formData) => {
    return {
      ...soumissionDepuisFormData(formData),
      productId: parseRequiredId(formData, "productId"),
    }
  },
  run: async ({ productId, champs, images, tentativeId }, client) => {
    // Aucune lecture ni vérification d'image ici : la propriété d'une Image
    // produit persistée est l'invariant du Catalogue, appliqué une seule fois
    // dans `updateProduct`, qui refuse une URL glissée même accompagnée d'une
    // revendication valide.
    const persistedImages = urlsPersistees(images)
    const draftIds = identifiantsBrouillons(images)

    if (draftIds.length === 0) {
      await updateProduct(productId, {
        ...champs,
        images: persistedImages,
      })
      redirect("/admin/produits")
    }

    const resultat = await cycleVieImageProduit.revendiquerEtEnregistrer({
      tentativeId,
      ownerId: client.id,
      draftIds,
      resultatDejaPersiste: async (productId) => {
        const product = await getAdminProduct(productId)
        if (!product) throw new Error("Produit enregistré introuvable")
        return product
      },
      enregistrer: async (promues, lier) => {
        const product = await updateProduct(
          productId,
          {
            ...champs,
            images: urlsGalerieMiseAJour(images, promues),
          },
          undefined,
          {
            lier,
            promues: promues.map((image) => image.publicUrl),
          }
        )
        return { productId: product.id, result: product }
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
