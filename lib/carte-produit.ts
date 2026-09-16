/**
 * La Carte produit — module neutre, sans directive.
 *
 * Propriétaire unique d'ADR-0022 : `CarteProduit` est la forme à huit
 * faits sous laquelle un Produit s'affiche dans une liste (accueil,
 * catégorie, Produits liés, résultats de Recherche) — première image,
 * Prix courant, stock total, Livraison offerte et lien vers sa page
 * Produit. `projeterCarteProduit` projette ces faits depuis les données
 * d'un Produit : `images` brutes (le premier élément est retenu, sinon
 * `null`) et métriques **déjà cuites** par `@/lib/product-metrics` —
 * jamais re-dérivées ici. `urlProduit` écrit le chemin relatif de la page
 * Produit.
 *
 * La règle de rupture appartient à la projection, pas à l'appelant :
 * l'option de masquage est typée — « montrer » répond une `CarteProduit`
 * totale, « masquer » répond `CarteProduit | null` (`null` quand le stock
 * total est nul, #164). Une seule implémentation derrière les deux.
 *
 * NE JAMAIS ajouter `"use client"` ici : le module est destiné aux deux
 * côtés de la couture — les composants clients qui rendent une Carte
 * produit (Produit lié, suggestions de Recherche) comme les modules de
 * lecture serveur qui la produisent (`@/lib/use-cases/blog` aujourd'hui).
 *
 * NE JAMAIS importer `@/lib/db` (ni `next/headers`, ni `server-only`) ici :
 * un import serveur réintroduirait `pg` (`require('dns')`) dans le bundle
 * navigateur et casserait `next build` (Turbopack), comme documenté dans
 * `devis-frontiere.test.ts`. La garde `carte-produit-frontiere.test.ts`
 * verrouille cette neutralité.
 *
 * Non-buts : aucune requête, aucune arithmétique de prix ni de stock (elles
 * restent à `@/lib/product-metrics`, composées par chaque module de
 * lecture) ; aucune URL absolue (`${site.url}` reste au constructeur de
 * Données structurées, et `pageMetadata` garde un `path` relatif) ; le
 * Document d'index (`toIndexableProduct`) garde ses propres métriques de
 * réindexation (ADR-0013).
 */

/**
 * Une Carte produit : les huit faits sous lesquels un Produit s'affiche
 * dans une liste. Forme unique — remplace `ProductCard` et
 * `SearchProductCard`.
 */
export interface CarteProduit {
  id: string
  name: string
  slug: string
  brand: string
  image: string | null
  minPrice: number
  totalStock: number
  freeShipping: boolean
}

/**
 * Les faits d'un Produit dont se projette sa Carte produit : son identité,
 * ses `images` brutes (le premier élément est retenu) et ses métriques
 * **déjà calculées** par `@/lib/product-metrics` — `minPrice` (le Prix
 * courant) et `totalStock` — plus la Livraison offerte. Le projecteur ne
 * chiffre jamais.
 */
export interface FaitsCarteProduit {
  id: string
  name: string
  slug: string
  brand: string
  images: unknown
  minPrice: number
  totalStock: number
  freeShipping: boolean
}

/**
 * Politique de rupture demandée au projecteur : « montrer » garde la Carte
 * produit même sans stock, « masquer » la retire (#164).
 */
export type MasquageRupture = "montrer" | "masquer"

/**
 * Projette la Carte produit d'un Produit : l'image est la première des
 * `images`, sinon `null` ; les métriques cuites sont recopiées telles
 * quelles. Le masquage de la rupture est demandé explicitement et son type
 * rétrécit le retour — « montrer » ne répond jamais `null`, « masquer »
 * répond `null` si et seulement si le stock total est nul.
 */
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: "masquer" }
): CarteProduit | null
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: "montrer" }
): CarteProduit
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: MasquageRupture }
): CarteProduit | null {
  if (options.rupture === "masquer" && faits.totalStock === 0) return null
  const images = Array.isArray(faits.images) ? (faits.images as string[]) : []
  return {
    id: faits.id,
    name: faits.name,
    slug: faits.slug,
    brand: faits.brand,
    image: images[0] ?? null,
    minPrice: faits.minPrice,
    totalStock: faits.totalStock,
    freeShipping: faits.freeShipping,
  }
}

/**
 * Chemin relatif de la page Produit : `/produit/<slug>`. Le slug est le
 * langage public du Produit et n'est pas percent-encodé — la composition
 * `${site.url}` reste au constructeur de Données structurées, et
 * `pageMetadata` continue de recevoir un `path` relatif.
 */
export function urlProduit(slug: string): string {
  return `/produit/${slug}`
}
