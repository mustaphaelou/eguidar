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
      // Cette galerie, ce propriétaire, cette tentative, et voici comment le
      // Catalogue s'écrit. Le cycle de vie a découpé, promu et réassemblé dans
      // l'ordre de l'éditeur ; la valeur qu'il tend est celle que la mutation
      // reçoit, et cette action n'y ajoute rien.
      //
      // Une galerie sans Brouillon passe ici aussi : c'est le même chemin, et
      // rien ici n'a à savoir s'il y en a un. Le sous-ensemble promu est alors
      // vide, et c'est la règle du Catalogue, appliquée une seule fois dans
      // `createProduct`, qui décide si ces URL peuvent être écrites ; l'éditeur
      // reçoit son refus s'il y a lieu.
      //
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
          galerie: images,
          resultatDejaPersiste,
          enregistrer: async (revendication) => {
            const product = await createProduct(
              { ...champsCatalogue, images: [...revendication.galerie] },
              undefined,
              revendication
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
    // revendication valide. Une galerie sans Brouillon n'a rien de spécial,
    // donc elle ne court-circuite plus.
    //
    // Cette galerie, ce propriétaire, cette tentative, et voici comment le
    // Catalogue s'écrit — ici une mise à jour, là une création : le cycle de
    // vie n'en sait rien et n'a pas à le savoir. La relecture d'un commit déjà
    // durable est celle de l'action de création, écrite une seule fois.
    const resultat =
      await cycleVieImageProduit.revendiquerEtEnregistrer<unknown>({
        tentativeId,
        ownerId: client.id,
        galerie: images,
        resultatDejaPersiste,
        enregistrer: async (revendication) => {
          const product = await updateProduct(
            productId,
            { ...champsCatalogue, images: [...revendication.galerie] },
            undefined,
            revendication
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
