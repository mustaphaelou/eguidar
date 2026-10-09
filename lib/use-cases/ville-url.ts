import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"

export function villeVersParam(ville: { slug: string }): string {
  return `?ville=${encodeURIComponent(ville.slug)}`
}

export function resoudreVilleUrl(
  cities: DeliveryCityOption[],
  villeParam?: string | null
): { urlVilleId: string | null; urlVilleFournie: boolean } {
  const demandee = villeParam?.trim()
  if (!demandee) return { urlVilleId: null, urlVilleFournie: false }

  const parSlug = cities.find((ville) => ville.slug === demandee)
  if (parSlug) return { urlVilleId: parSlug.id, urlVilleFournie: true }

  const parId = cities.find((ville) => ville.id === demandee)
  return { urlVilleId: parId?.id ?? null, urlVilleFournie: true }
}
