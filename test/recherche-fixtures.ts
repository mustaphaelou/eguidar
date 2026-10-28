import { PRICE_BUCKETS } from "@/lib/price-buckets"
import type { OptionDeFiltre } from "@/lib/filtre-de-recherche"
import type { FaitStructure } from "@/lib/use-cases/lecture-structure"

export function faitsDesCategoriesRecherche({
  smartphonesSlug,
  audioSlug,
}: {
  smartphonesSlug: string
  audioSlug: string
}): FaitStructure[] {
  return [
    {
      id: "smartphones",
      name: "Smartphones",
      slug: smartphonesSlug,
      image: null,
      parentId: null,
      produitsDirects: 3,
      position: 0,
    },
    {
      id: "audio",
      name: "Audio & Hi-Fi",
      slug: audioSlug,
      image: null,
      parentId: null,
      produitsDirects: 2,
      position: 0,
    },
  ]
}

export function tranchesAttendues(
  comptes: Readonly<Record<string, number>> = {},
  retenue?: string
): OptionDeFiltre[] {
  return PRICE_BUCKETS.map(({ id, label }) => ({
    value: id,
    label,
    count: comptes[id] ?? 0,
    selected: id === retenue,
  }))
}
