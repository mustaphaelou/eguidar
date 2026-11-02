import { stockageImageProduitR2 } from "@/lib/r2"

/**
 * La suppression durable des images d'une Structure : une panne du stockage
 * remonte au travailleur, qui laisse une Exécution échouée et réessaie. Une
 * suppression silencieusement manquée ne serait jamais réparée, l'objet R2
 * restant sans référence dans la Structure.
 *
 * Le Catalogue garde son propre espace de noms ; l'image d'une Structure est
 * hors du préfixe des Images produit et se supprime donc par la clé de
 * catégorie.
 */
export async function supprimerImagesStructureDuStockage(
  publicUrls: readonly string[]
): Promise<void> {
  for (const url of publicUrls) {
    const resultat = await stockageImageProduitR2.supprimerImageCategorie(url)
    if (!resultat.ok) {
      throw new Error(
        `suppression de l'image de Structure ${url} impossible (${resultat.erreur.code}) : ${resultat.erreur.message}`
      )
    }
  }
}
