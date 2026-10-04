import type { IndexableProduct } from "@/lib/index-projection"
import type {
  MoteurRecherche,
  RepartitionsMoteur,
  ReponseMoteur,
  RequeteMoteur,
} from "@/lib/moteur-recherche"
import { getPriceBucket } from "@/lib/price-buckets"
import type {
  SearchFacet,
  SearchFilters,
  SearchSort,
} from "@/lib/search-params"

/**
 * Moteur de recherche en mémoire — approximation documentée de Meilisearch,
 * pour les suites qui n'ont ni Docker ni moteur (ADR-0023).
 *
 * Ce qui est imité : le repli de la casse et des accents, les Filtres de
 * recherche appliqués tels quels (marques en union, catégorie, Tranche de
 * prix sur le `minPrice` déjà cuit), les quatre tris, la pagination et les
 * répartitions sous les filtres reçus. Le total est la mesure de la requête
 * de page : une requête de décompte (`taille: 0`, ou absente) ne mesure rien
 * et répond `total: 0`.
 *
 * L'appartenance au texte, elle, n'est pas de la fidélité : chaque token de
 * la requête est ici préfixe d'un token du document, et cette phrase n'est
 * vraie que de ce moteur. Meilisearch ne fait pas ainsi — son `prefixSearch`
 * vaut `indexingTime`, il ne troncature que le dernier mot de la requête —
 * et c'est pourquoi « chaque terme de la requête doit être trouvé » se mesure
 * sur un moteur vivant (`lib/meili-correspondance.test.ts`), pas ici. Le
 * redire sur ce double serait une preuve sans moteur sous elle.
 *
 * Ce qu'il n'atteste donc pas : le classement par pertinence (`pertinence`
 * garde l'ordre d'entrée), la sémantique des fautes de frappe et la
 * localisation française, ni l'ordre ni le plafond des valeurs de facette —
 * une répartition rend ici une clé par document, dans l'ordre de leur
 * rencontre, jamais tronquée. C'est un double de test, et non un second
 * moteur : rapide et sans moteur à démarrer, il éprouve l'orchestration —
 * le retrait de la clause d'une facette (ADR-0016), le bornage d'une page
 * hors bornes, le chemin hermétique — et non la qualité d'une Recherche.
 *
 * Il est toujours disponible et ne répond jamais l'indisponible, et c'est
 * aussi ce qui l'exclut de l'indisponibilité : `chercher` n'a qu'un retour,
 * `statut: "ok"` y est écrit en dur, et aucune branche ne pourrait rendre
 * autre chose. Elle ne s'éprouve donc pas ici, mais par un moteur de recette,
 * figé sur une réponse (`test/moteur-recherche-recette.ts`).
 */

/** La même liste que `SEARCHABLE_PRODUCT_ATTRIBUTES` de `lib/meili.ts`. */
const ATTRIBUTS_RECHERCHABLES = [
  "name",
  "brand",
  "categoryName",
  "description",
  "specsText",
  "variantNames",
  "skus",
] as const

function replier(texte: string): string {
  return texte
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function jetons(texte: string): string[] {
  return replier(texte)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
}

function texteRecherchable(document: IndexableProduct): string {
  return ATTRIBUTS_RECHERCHABLES.map((attribut) => {
    const valeur = document[attribut]
    return Array.isArray(valeur) ? valeur.join(" ") : valeur
  }).join(" ")
}

function correspondAuTexte(document: IndexableProduct, query: string): boolean {
  const jetonsRequete = jetons(query)
  if (jetonsRequete.length === 0) return true
  const jetonsDocument = jetons(texteRecherchable(document))
  return jetonsRequete.every((jeton) =>
    jetonsDocument.some((candidat) => candidat.startsWith(jeton))
  )
}

function correspondAuxFiltres(
  document: IndexableProduct,
  filtres: SearchFilters
): boolean {
  const marques = filtres.brand ?? []
  if (marques.length > 0 && !marques.includes(document.brand)) return false
  if (filtres.categorySlug && document.categorySlug !== filtres.categorySlug) {
    return false
  }
  const tranche = getPriceBucket(filtres.priceBucketId)
  if (tranche) {
    if (document.minPrice < tranche.minCents) return false
    if (tranche.maxCents !== null && document.minPrice >= tranche.maxCents) {
      return false
    }
  }
  return true
}

function trier(
  documents: IndexableProduct[],
  tri: SearchSort | undefined
): IndexableProduct[] {
  const copies = [...documents]
  if (tri === "prix-asc") return copies.sort((a, b) => a.minPrice - b.minPrice)
  if (tri === "prix-desc") return copies.sort((a, b) => b.minPrice - a.minPrice)
  if (tri === "nouveautes") {
    return copies.sort((a, b) => b.updatedAt - a.updatedAt)
  }
  return copies
}

function valeurDeFacette(
  document: IndexableProduct,
  facette: SearchFacet
): string {
  if (facette === "brand") return document.brand
  if (facette === "categorySlug") return document.categorySlug
  return document.priceBucket
}

function repartir(
  documents: IndexableProduct[],
  requete: RequeteMoteur
): RepartitionsMoteur {
  const repartitions: RepartitionsMoteur = {}
  for (const facette of requete.facettes ?? []) {
    const filtres = requete.filtres ?? {}
    const comptes: Record<string, number> = {}
    for (const document of documents) {
      if (!correspondAuTexte(document, requete.query)) continue
      if (!correspondAuxFiltres(document, filtres)) continue
      const valeur = valeurDeFacette(document, facette)
      comptes[valeur] = (comptes[valeur] ?? 0) + 1
    }
    repartitions[facette] = comptes
  }
  return repartitions
}

export function creerMoteurEnMemoire(
  documents: IndexableProduct[]
): MoteurRecherche {
  return {
    async chercher(requete: RequeteMoteur): Promise<ReponseMoteur> {
      const correspondants = trier(
        documents.filter(
          (document) =>
            correspondAuTexte(document, requete.query) &&
            correspondAuxFiltres(document, requete.filtres ?? {})
        ),
        requete.tri
      )
      const taille = requete.taille ?? 0
      const page = requete.page ?? 1

      return {
        statut: "ok",
        documents:
          taille > 0
            ? correspondants.slice((page - 1) * taille, page * taille)
            : [],
        // Le total est la mesure de la page : la requête de décompte
        // (`taille: 0`) ne mesure rien, comme celle de l'adaptateur Meili.
        total: taille > 0 ? correspondants.length : 0,
        repartitions: repartir(documents, requete),
      }
    },
  }
}
