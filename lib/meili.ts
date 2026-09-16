import { Meilisearch } from "meilisearch"

import type { IndexableProduct } from "@/lib/index-projection"
import {
  retirerFacette,
  type MoteurRecherche,
  type RepartitionsMoteur,
  type ReponseMoteur,
  type RequeteMoteur,
} from "@/lib/moteur-recherche"
import { buildSearchFilter, type SearchSort } from "@/lib/search-params"

const globalForMeili = globalThis as unknown as { meili?: Meilisearch }

export const PRODUCTS_INDEX = "products"

export function getMeiliSearch() {
  const host = process.env.MEILI_URL
  const apiKey = process.env.MEILI_MASTER_KEY
  if (!host) return null
  if (!globalForMeili.meili) {
    globalForMeili.meili = new Meilisearch({ host, apiKey })
  }
  return globalForMeili.meili
}

const SEARCHABLE_PRODUCT_ATTRIBUTES = [
  "name",
  "brand",
  "categoryName",
  "description",
  "specsText",
  "variantNames",
  "skus",
]

export async function ensureProductsIndex(meili: Meilisearch) {
  const settings = {
    searchableAttributes: SEARCHABLE_PRODUCT_ATTRIBUTES,
    filterableAttributes: ["brand", "categorySlug", "minPrice", "priceBucket"],
    sortableAttributes: ["minPrice", "updatedAt"],
    localizedAttributes: [
      {
        attributePatterns: SEARCHABLE_PRODUCT_ATTRIBUTES,
        locales: ["fr"],
      },
    ],
  }
  try {
    await meili.index(PRODUCTS_INDEX).fetchInfo()
  } catch {
    await meili.createIndex(PRODUCTS_INDEX, { primaryKey: "id" })
    await meili.index(PRODUCTS_INDEX).updateSettings(settings)
    return
  }
  await meili.index(PRODUCTS_INDEX).update({ primaryKey: "id" })
  await meili.index(PRODUCTS_INDEX).updateSettings(settings)
}

export async function indexProductDocuments(products: IndexableProduct[]) {
  const meili = getMeiliSearch()
  if (!meili || products.length === 0) return
  await ensureProductsIndex(meili)
  await meili.index(PRODUCTS_INDEX).addDocuments(products, { primaryKey: "id" })
}

export async function deleteProductDocument(productId: string) {
  const meili = getMeiliSearch()
  if (!meili) return
  return meili.index(PRODUCTS_INDEX).deleteDocument(productId)
}

const SORT_TO_MEILI: Record<SearchSort, string[] | undefined> = {
  pertinence: undefined,
  "prix-asc": ["minPrice:asc"],
  "prix-desc": ["minPrice:desc"],
  nouveautes: ["updatedAt:desc"],
}

const PRODUCT_ATTRIBUTES_TO_RETRIEVE = [
  "id",
  "name",
  "slug",
  "brand",
  "images",
  "minPrice",
  "totalStock",
  "freeShipping",
]

const SUGGESTION_ATTRIBUTES_TO_RETRIEVE = [
  "id",
  "name",
  "slug",
  "brand",
  "images",
  "minPrice",
]

/**
 * Projection d'exécution de la page demandée : les suggestions sont la
 * seule page sans filtres ni tri, et la seule qui demande ses répartitions
 * dans la même requête — leur projection reste légère, toute autre page
 * reçoit la projection complète des cartes produit. Le Document d'index
 * n'est jamais projeté en entier : `attributesToRetrieve` est une
 * projection d'exécution, jamais un second type.
 */
function pageAttributes(requete: RequeteMoteur): string[] {
  const suggestions =
    requete.filtres === undefined &&
    requete.tri === undefined &&
    (requete.facettes?.length ?? 0) > 0
  return suggestions
    ? SUGGESTION_ATTRIBUTES_TO_RETRIEVE
    : PRODUCT_ATTRIBUTES_TO_RETRIEVE
}

/**
 * Le MoteurRecherche de production : la page demandée (quand `taille > 0`)
 * puis une requête « facette seule » par facette à compter, toutes en
 * parallèle. La clause de la facette comptée est retirée au point d'usage
 * (ADR-0016) ; `total` reste l'estimation du moteur et `repartitions` ne
 * porte que les facettes demandées.
 *
 * Déclaré ici pour que l'absence de moteur reste testable avec un client
 * de substitution : #367 remplacera cette réponse vide par un
 * `statut: "indisponible"` typé.
 */
export async function chercherAvecMeili(
  meili: Meilisearch | null,
  requete: RequeteMoteur
): Promise<ReponseMoteur> {
  if (!meili) return { documents: [], total: 0, repartitions: {} }

  const index = meili.index<IndexableProduct>(PRODUCTS_INDEX)
  const filtres = requete.filtres ?? {}
  const facettes = requete.facettes ?? []
  const taille = requete.taille ?? 0

  const requetes = [
    ...(taille > 0
      ? [
          index.search(requete.query, {
            filter: buildSearchFilter(filtres),
            limit: taille,
            offset: ((requete.page ?? 1) - 1) * taille,
            sort: SORT_TO_MEILI[requete.tri ?? "pertinence"],
            attributesToRetrieve: pageAttributes(requete),
          }),
        ]
      : []),
    ...facettes.map((facette) =>
      index.search(requete.query, {
        filter: buildSearchFilter(retirerFacette(filtres, facette)),
        facets: [facette],
        limit: 0,
      })
    ),
  ]
  const reponses = await Promise.all(requetes)
  // Une requête « facette seule » (`taille: 0`) n'a pas de page : toutes
  // ses réponses sont des répartitions.
  const reponsePage = taille > 0 ? reponses[0] : undefined
  const reponsesFacettes = taille > 0 ? reponses.slice(1) : reponses

  const repartitions: RepartitionsMoteur = {}
  facettes.forEach((facette, position) => {
    const distribution = reponsesFacettes[position].facetDistribution?.[facette]
    if (distribution) repartitions[facette] = distribution
  })

  return {
    documents: reponsePage?.hits ?? [],
    total: reponsePage?.estimatedTotalHits ?? 0,
    repartitions,
  }
}

export function moteurMeili(): MoteurRecherche {
  return {
    chercher: (requete) => chercherAvecMeili(getMeiliSearch(), requete),
  }
}
