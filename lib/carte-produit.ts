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
 * l'option de masquage est typée — « montrer » exige les deux métriques et
 * répond une `CarteProduit` totale, « masquer » accepte des faits sans elles
 * et répond `CarteProduit | null` (`null` quand le stock total connu est nul,
 * #164). Une seule implémentation derrière les deux.
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
 *
 * Les deux dernières sont optionnelles parce que tous les lecteurs ne les
 * connaissent pas : le chemin de lecture d'un Produit les fournit toujours
 * (« montrer » les exige), tandis que la rangée de Suggestion de produit —
 * six faits — ne demande ni le stock total ni la Livraison offerte. Sous
 * « masquer », un stock total absent veut dire « inconnu » et ne masque
 * jamais.
 */
export interface FaitsCarteProduit {
  id: string
  name: string
  slug: string
  brand: string
  images: unknown
  minPrice: number
  totalStock?: number
  freeShipping?: boolean
}

/**
 * Projette la Carte produit d'un Produit : l'image est la première des
 * `images` qui soit une chaîne, sinon `null` ; les métriques cuites sont
 * recopiées telles quelles. Le masquage de la rupture est demandé
 * explicitement et son type rétrécit le retour — « montrer » exige les deux
 * métriques et ne répond jamais `null` ; « masquer » accepte des faits sans
 * elles et répond `null` si et seulement si le stock total **connu** est nul
 * (#164).
 *
 * Sous « masquer », les deux métriques absentes sont projetées à `0` et
 * `false` : le seul appelant qui les omet — la Suggestion de produit — réduit
 * aussitôt la carte à ses six faits et ne les rend jamais.
 */
export function projeterCarteProduit(
  faits: FaitsCarteProduit & { totalStock: number; freeShipping: boolean },
  options: { rupture: "montrer" }
): CarteProduit
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: "masquer" }
): CarteProduit | null
export function projeterCarteProduit(
  faits: FaitsCarteProduit,
  options: { rupture: "montrer" | "masquer" }
): CarteProduit | null {
  if (options.rupture === "masquer" && faits.totalStock === 0) return null
  const images = Array.isArray(faits.images)
    ? faits.images.filter((i): i is string => typeof i === "string")
    : []
  return {
    id: faits.id,
    name: faits.name,
    slug: faits.slug,
    brand: faits.brand,
    image: images[0] ?? null,
    minPrice: faits.minPrice,
    totalStock: faits.totalStock ?? 0,
    freeShipping: faits.freeShipping ?? false,
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
