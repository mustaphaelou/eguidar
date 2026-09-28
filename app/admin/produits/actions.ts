"use server"

import { redirect } from "next/navigation"

import cycleVieImageProduit from "@/lib/cycle-vie-image-produit"
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

/**
 * Les deux questions que ces deux aides — et elles seules — posent encore.
 *
 * Elles ne servent qu'aux deux court-circuits qui restent ici : tant qu'une
 * galerie sans Brouillon court-circuite avant d'atteindre le cycle de vie,
 * l'action doit encore savoir s'il y a un Brouillon à revendiquer, et quelles
 * URL une galerie entièrement persistée porte déjà. **Le découpage de la
 * galerie pour la revendication, lui, a disparu** : c'est le module du cycle de
 * vie qui le fait, sur la galerie entière, et il rend la valeur ordonnée. Les
 * court-circuits et ces deux questions partent donc ensemble (ticket #457).
 */
function porteUnBrouillon(images: readonly EntreeImageProduit[]): boolean {
  return images.some((image) => image.kind === "brouillon")
}

function urlsPersistees(images: readonly EntreeImageProduit[]): string[] {
  return images.flatMap((image) =>
    image.kind === "persistee" ? [image.url] : []
  )
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
      // Court-circuit d'une galerie sans Brouillon : il reste ici jusqu'à ce
      // que cette galerie prenne le même chemin que les autres (ticket #457).
      // Il n'a rien à voir avec la revendication, qui reçoit la galerie
      // entière, quel qu'en soit le contenu.
      //
      // Une galerie sans Brouillon reste une création légale, et ses URL sont
      // transmises telles quelles : ce qui décide si une création peut les
      // écrire est la règle du Catalogue, appliquée une seule fois dans
      // `createProduct`, et l'éditeur reçoit le refus de cette règle s'il y a
      // lieu.
      if (!porteUnBrouillon(images)) {
        const product = await createProduct({
          ...champsCatalogue,
          images: urlsPersistees(images),
        })
        redirect(`/admin/produits/${product.id}`)
      }

      // Cette galerie, ce propriétaire, cette tentative, et voici comment le
      // Catalogue s'écrit. Le cycle de vie a découpé, promu et réassemblé dans
      // l'ordre de l'éditeur ; la valeur qu'il tend est celle que la mutation
      // reçoit, et cette action n'y ajoute rien.
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
    // revendication valide.
    //
    // Court-circuit d'une galerie sans Brouillon, comme dans l'action de
    // création, et pour la même raison (ticket #457).
    if (!porteUnBrouillon(images)) {
      await updateProduct(productId, {
        ...champsCatalogue,
        images: urlsPersistees(images),
      })
      redirect("/admin/produits")
    }

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
