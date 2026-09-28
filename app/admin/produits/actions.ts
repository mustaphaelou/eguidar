"use server"

import { redirect } from "next/navigation"

import cycleVieImageProduit, {
  creerRevendicationImagesProduit,
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
    run: async ({ champsCatalogue, images, tentativeId }, client) => {
      const draftIds = identifiantsBrouillons(images)

      if (draftIds.length === 0) {
        // Une galerie sans Brouillon reste une création légale. Les URL qu'elle
        // porte sont transmises telles quelles : ce qui décide si une création
        // peut les écrire est la règle du Catalogue, appliquée une seule fois
        // dans `createProduct`, et l'éditeur reçoit le refus de cette règle
        // s'il y a lieu.
        const product = await createProduct({
          ...champsCatalogue,
          images: urlsPersistees(images),
        })
        redirect(`/admin/produits/${product.id}`)
      }

      // `unknown` : les deux callbacks ne rendent pas la même chose, et le
      // cycle de vie ne lit ni l'un ni l'autre. La relecture rend les faits
      // du formulaire (ADR-0026) ; l'enregistrement rend la rangée qu'il
      // vient d'écrire. Avant ADR-0026 les deux répondaient une rangée de
      // base — par accident, parce que les deux lectures renvoyaient la même
      // chose. Unifier leur type autrement qu'en `unknown` prétendrait
      // qu'elles rendent le même fait, ce qu'elles ne font pas.
      const resultat =
        await cycleVieImageProduit.revendiquerEtEnregistrer<unknown>({
          tentativeId,
          ownerId: client.id,
          draftIds,
          resultatDejaPersiste,
          enregistrer: async (promues, lier) => {
            const galerie = promues.map((image) => image.publicUrl)
            const product = await createProduct(
              { ...champsCatalogue, images: galerie },
              undefined,
              creerRevendicationImagesProduit({
                galerie,
                promues: promues.map((image) => image.publicUrl),
                lier,
              })
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
  run: async ({ productId, champsCatalogue, images, tentativeId }, client) => {
    // Aucune lecture ni vérification d'image ici : la propriété d'une Image
    // produit persistée est l'invariant du Catalogue, appliqué une seule fois
    // dans `updateProduct`, qui refuse une URL glissée même accompagnée d'une
    // revendication valide.
    const persistedImages = urlsPersistees(images)
    const draftIds = identifiantsBrouillons(images)

    if (draftIds.length === 0) {
      await updateProduct(productId, {
        ...champsCatalogue,
        images: persistedImages,
      })
      redirect("/admin/produits")
    }

    // `unknown` : même raison, même commentaire, que dans l'action de
    // création — la relecture rend les faits du formulaire, l'enregistrement la
    // rangée qu'il vient d'écrire, et le cycle de vie ne lit ni l'un ni l'autre.
    const resultat =
      await cycleVieImageProduit.revendiquerEtEnregistrer<unknown>({
        tentativeId,
        ownerId: client.id,
        draftIds,
        resultatDejaPersiste: async (productId) => {
          const product = await getAdminProduct(productId)
          if (!product) throw new Error("Produit enregistré introuvable")
          return product
        },
        enregistrer: async (promues, lier) => {
          const galerie = urlsGalerieMiseAJour(images, promues)
          const product = await updateProduct(
            productId,
            { ...champsCatalogue, images: galerie },
            undefined,
            creerRevendicationImagesProduit({
              galerie,
              promues: promues.map((image) => image.publicUrl),
              lier,
            })
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
