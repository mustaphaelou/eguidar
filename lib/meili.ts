import { Meilisearch, type Settings } from "meilisearch"

import type { IndexableProduct } from "@/lib/index-projection"
import type {
  MoteurRecherche,
  RepartitionsMoteur,
  ReponseDocuments,
  ReponseMoteur,
  RequeteMoteur,
} from "@/lib/moteur-recherche"
import { getPriceBucket, type PriceBucket } from "@/lib/price-buckets"
import type { SearchFilters, SearchSort } from "@/lib/search-params"

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

/**
 * Les requêtes d'un ou deux caractères sont trop ambiguës pour chercher dans
 * les descriptions : `TV` y préfixe par exemple le texte juridique « TVA »
 * présent sur chaque Produit. Les champs de nom, de catégorie et de
 * caractéristiques restent assez larges pour trouver « TV », « 4K » ou un SKU,
 * sans faire remonter tout le Catalogue à cause d'un préfixe accidentel.
 */
const SEARCHABLE_PRODUCT_ATTRIBUTES_WITHOUT_DESCRIPTION =
  SEARCHABLE_PRODUCT_ATTRIBUTES.filter(
    (attribute) => attribute !== "description"
  )

function attributesToSearchOn(query: string): string[] | undefined {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length === 0 || trimmedQuery.length > 2) return undefined
  return SEARCHABLE_PRODUCT_ATTRIBUTES_WITHOUT_DESCRIPTION
}

/**
 * Chaque terme de la requête doit être trouvé dans le document : c'est la
 * promesse que la Recherche porte au Visiteur, et le moteur n'en fait pas son
 * défaut. Son défaut, `last`, relâche — il retire les mots de la fin jusqu'à
 * remplir une page — donc « samsung iphone » ou « 128 Go 256 » rendait des
 * Produits, pendant que les tests du dépôt disaient le contraire.
 *
 * Ce n'est pas un réglage d'index : le moteur refuse le champ parmi les
 * réglages (`Unknown field 'matchingStrategy'`), `GET /indexes/<uid>/settings`
 * ne le rend pas, et le SDK ne le déclare que parmi les paramètres de requête.
 * Il s'écrit donc ici, sur *chaque* requête — la page comme les requêtes de
 * facette, sans quoi les options de filtre compteraient sur une requête plus
 * large que celle qui rend les résultats.
 *
 * **Le rétrécissement est un choix, et il se voit.** Un Visiteur qui tape deux
 * mots sur trois voit moins de Produits qu'avant, et le bandeau de suggestions
 * ne propose plus rien tant que la requête n'est pas complète. L'autre voie est
 * le relâchement du moteur — ce que la production faisait, et ce que les tests
 * du dépôt niaient. Une faute de frappe reste permise : « chaque terme trouvé »
 * veut dire « présent ou mal orthographié », jamais « présent à la lettre
 * près ». `lib/meili-correspondance.test.ts` mesure les deux sur un moteur
 * vivant, contrôle négatif compris.
 */
const MATCHING_STRATEGY = "all" as const

/**
 * Les trois réglages que le Visiteur voit et que le moteur appliquait sans que
 * rien ne les écrive : la tolérance aux fautes — un mot mal orthographié doit
 * quand même trouver son Produit —, le plafond de la fenêtre de résultats, et
 * l'ordre puis le plafond des valeurs de facette, c'est-à-dire les options de
 * filtre du panneau.
 *
 * Les valeurs sont celles que Meilisearch v1.52 applique par défaut. Les écrire
 * ne change donc rien de ce qu'un Visiteur voit ; cela retire seulement la
 * possibilité qu'une montée de version les change en silence. `lib/meili-reglages.test.ts`
 * les relit sur un moteur vivant et échoue si elles dérivent.
 *
 * `pagination.maxTotalHits` borne la fenêtre accessible — passé ce plafond, une
 * page rend zéro document — et non le total rendu : le nombre affiché reste
 * l'estimation du moteur, que ce plafond ne touche pas (ADR-0023).
 *
 * La stratégie de correspondance, elle, n'est pas ici : le moteur n'a pas de
 * réglage de ce nom, et elle voyage avec chaque requête — voir
 * `MATCHING_STRATEGY` plus bas.
 */
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
    typoTolerance: {
      enabled: true,
      minWordSizeForTypos: { oneTypo: 5, twoTypos: 9 },
      disableOnWords: [],
      disableOnAttributes: [],
      disableOnNumbers: false,
    },
    pagination: { maxTotalHits: 1000 },
    faceting: {
      maxValuesPerFacet: 100,
      sortFacetValuesBy: { "*": "alpha" },
    },
  } satisfies Settings
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

/**
 * Toutes les requêtes de page reçoivent la même projection produit complète.
 * La projection des six faits d'une Suggestion de produit appartient aux
 * cas d'usage, au-dessus de cette couture.
 */
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

/** La syntaxe des valeurs d'un filtre Meili reste locale à cet adaptateur. */
function escapeFilterValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function priceBucketFilter(bucket: PriceBucket): string {
  if (bucket.maxCents === null) return `minPrice >= ${bucket.minCents}`
  return `minPrice >= ${bucket.minCents} AND minPrice < ${bucket.maxCents}`
}

function buildSearchFilter(filters: SearchFilters): string | undefined {
  const clauses: string[] = []

  const brands = filters.brand ?? []
  if (brands.length > 0) {
    const values = brands
      .map((brand) => `"${escapeFilterValue(brand)}"`)
      .join(", ")
    clauses.push(`brand IN [${values}]`)
  }

  if (filters.categorySlug) {
    clauses.push(`categorySlug = "${escapeFilterValue(filters.categorySlug)}"`)
  }

  const bucket = getPriceBucket(filters.priceBucketId)
  if (bucket) clauses.push(`(${priceBucketFilter(bucket)})`)

  return clauses.length > 0 ? clauses.join(" AND ") : undefined
}

/**
 * La page demandée (quand `taille > 0`) puis une requête « facette seule »
 * par facette à compter, toutes en parallèle — le travail Meili lui-même.
 * L'adaptateur applique exactement les filtres qu'il reçoit : le retrait de
 * la clause d'une facette (ADR-0016) est le fait de l'orchestration.
 * `total` est l'estimation de la page demandée, `0` quand il n'y en a pas,
 * et `repartitions` ne porte que les facettes demandées. Un rejet du SDK
 * remonte à l'appelant : c'est `chercherAvecMeili` qui le convertit.
 */
async function interrogerMeili(
  meili: Meilisearch,
  requete: RequeteMoteur
): Promise<ReponseDocuments> {
  const index = meili.index<IndexableProduct>(PRODUCTS_INDEX)
  const filtres = requete.filtres ?? {}
  const facettes = requete.facettes ?? []
  const taille = requete.taille ?? 0
  const searchAttributes = attributesToSearchOn(requete.query)
  const filter = buildSearchFilter(filtres)

  const requetes = [
    ...(taille > 0
      ? [
          index.search(requete.query, {
            filter,
            limit: taille,
            offset: ((requete.page ?? 1) - 1) * taille,
            sort: SORT_TO_MEILI[requete.tri ?? "pertinence"],
            attributesToRetrieve: PRODUCT_ATTRIBUTES_TO_RETRIEVE,
            matchingStrategy: MATCHING_STRATEGY,
            ...(searchAttributes
              ? { attributesToSearchOn: searchAttributes }
              : {}),
          }),
        ]
      : []),
    ...facettes.map((facette) =>
      index.search(requete.query, {
        filter,
        facets: [facette],
        limit: 0,
        matchingStrategy: MATCHING_STRATEGY,
        ...(searchAttributes ? { attributesToSearchOn: searchAttributes } : {}),
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
    statut: "ok",
    documents: reponsePage?.hits ?? [],
    total: reponsePage?.estimatedTotalHits ?? 0,
    repartitions,
  }
}

/**
 * Le MoteurRecherche de production. Ses deux visages d'indisponibilité — le
 * client nul (`MEILI_URL` absent) et le moteur configuré mais injoignable —
 * répondent le même fait typé : le rejet du SDK est converti ici et ne
 * franchit jamais la couture. Déclaré ici pour que l'absence de moteur reste
 * testable avec un client de substitution.
 */
export async function chercherAvecMeili(
  meili: Meilisearch | null,
  requete: RequeteMoteur
): Promise<ReponseMoteur> {
  if (!meili) return { statut: "indisponible" }

  try {
    return await interrogerMeili(meili, requete)
  } catch {
    return { statut: "indisponible" }
  }
}

export function moteurMeili(): MoteurRecherche {
  return {
    chercher: (requete) => chercherAvecMeili(getMeiliSearch(), requete),
  }
}
