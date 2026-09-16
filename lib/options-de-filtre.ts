import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"

/**
 * Option de filtre — l'assemblage unique du panneau de la Recherche.
 *
 * Le panneau était reconstruit deux fois : le serveur répondait des
 * décomptes et une liste partielle, la barre latérale refaisait sa propre
 * carte des décomptes, son propre tri `fr`, sa propre copie de la règle
 * « une option retenue reste visible à zéro » et son propre ordre des
 * Tranches de prix. Ce module est le seul propriétaire de ces règles
 * (CONTEXT.md, « Option de filtre ») : `searchProducts` l'appelle à côté
 * des requêtes de facettes, la barre latérale ne fait plus que rendre la
 * liste reçue.
 *
 * NE JAMAIS importer `@/lib/db`, `next/headers` ni `server-only` ici, ni
 * un module de Moteur de recherche : ce module est importé des deux côtés
 * de la couture client/serveur, et la garde
 * `lib/options-de-filtre-frontiere.test.ts` verrouille cette neutralité.
 * Il ne reçoit que des faits — trois répartitions, les filtres actifs, des
 * libellés déjà résolus — et n'interroge jamais rien : la lecture des noms
 * de catégorie reste dans `lib/use-cases/search.ts`, qui lui passe la
 * carte résolue.
 *
 * L'ADR-0016 garde sa règle de requête là où l'ADR-0023 l'a posée
 * (`retirerFacette`, au-dessus de la couture) ; ce module n'en porte que
 * la conséquence d'affichage : une valeur retenue est toujours émise, même
 * à zéro, et le décompte dit simplement la vérité.
 */

export interface OptionDeFiltre {
  value: string
  label: string
  count: number
  selected: boolean
}

/**
 * Les trois listes du panneau, dans l'ordre où la barre latérale les rend
 * — marques et catégories triées par libellé, Tranches de prix dans
 * l'ordre fixe de leurs bandes.
 */
export interface OptionsDeFiltre {
  brands: OptionDeFiltre[]
  categories: OptionDeFiltre[]
  priceBuckets: OptionDeFiltre[]
}

/** Les répartitions rendues par un moteur, indexées par valeur de facette. */
export interface RepartitionsDeFacettes {
  brands: Record<string, number>
  categories: Record<string, number>
  priceBuckets: Record<string, number>
}

/**
 * Marques : la répartition, plus chaque marque retenue même absente de
 * celle-ci (à zéro). Le libellé d'une marque est sa valeur — il n'y a rien
 * à résoudre en base.
 */
function assemblerMarques(
  repartition: Record<string, number>,
  retenues: readonly string[]
): OptionDeFiltre[] {
  const valeurs = new Set([...Object.keys(repartition), ...retenues])
  return [...valeurs]
    .map((value) => ({
      value,
      label: value,
      count: repartition[value] ?? 0,
      selected: retenues.includes(value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
}

/**
 * Catégories : la répartition, plus la catégorie retenue même absente de
 * celle-ci (à zéro). Un slug sans nom résolu retombe sur lui-même — ce que
 * la barre latérale faisait déjà pour une catégorie inconnue de la base.
 */
function assemblerCategories(
  repartition: Record<string, number>,
  retenue: string | undefined,
  noms: ReadonlyMap<string, string>
): OptionDeFiltre[] {
  const valeurs = new Set(Object.keys(repartition))
  if (retenue) valeurs.add(retenue)
  return [...valeurs]
    .map((value) => ({
      value,
      label: noms.get(value) ?? value,
      count: repartition[value] ?? 0,
      selected: value === retenue,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
}

/**
 * Tranches de prix : leur univers est connu (`PRICE_BUCKETS`), donc toutes
 * les bandes sont émises, à zéro comprises, dans l'ordre fixe des bandes —
 * jamais par décompte. C'est à la barre latérale de masquer celles qu'elle
 * doit masquer. Une valeur hors univers ne devient pas une option : la
 * répartition peut en porter d'obsolètes, `parseSearchParams` et
 * `buildSearchFilter` les ignorent déjà.
 */
function assemblerTranches(
  repartition: Record<string, number>,
  retenue: string | undefined
): OptionDeFiltre[] {
  return PRICE_BUCKETS.map((bande) => ({
    value: bande.id,
    label: bande.label,
    count: repartition[bande.id] ?? 0,
    selected: bande.id === retenue,
  }))
}

/**
 * Assemble les trois listes d'options à partir des faits : les
 * répartitions du moteur, les filtres en vigueur et les noms de catégorie
 * déjà résolus. Aucune base, aucun moteur, aucun état : une valeur entre,
 * une valeur sort.
 */
export function assemblerOptionsDeFiltre(
  repartitions: RepartitionsDeFacettes,
  filtres: SearchFilters,
  nomsDeCategories: ReadonlyMap<string, string>
): OptionsDeFiltre {
  return {
    brands: assemblerMarques(repartitions.brands, filtres.brand ?? []),
    categories: assemblerCategories(
      repartitions.categories,
      filtres.categorySlug,
      nomsDeCategories
    ),
    priceBuckets: assemblerTranches(
      repartitions.priceBuckets,
      filtres.priceBucketId
    ),
  }
}
