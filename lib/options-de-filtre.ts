import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"

export interface OptionDeFiltre {
  value: string
  label: string
  count: number
  selected: boolean
}

export interface OptionsDeFiltre {
  brands: OptionDeFiltre[]
  categories: OptionDeFiltre[]
  priceBuckets: OptionDeFiltre[]
}

export interface RepartitionsDeFacettes {
  brands: Record<string, number>
  categories: Record<string, number>
  priceBuckets: Record<string, number>
}

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
