/**
 * Langage d'URL de la Ville — module neutre, sans directive.
 *
 * Propriétaire unique de la règle d'ADR-0017 : à l'écriture,
 * `villeVersParam` émet le fragment `?ville=<slug>`, le slug seul
 * percent-encodé (jamais l'identifiant interne) — la CityPicker (client)
 * et le lien Passer commande du Panier (serveur) passent par lui ; à la
 * lecture, `resoudreVilleUrl` résout le slug d'abord, puis l'identifiant
 * interne comme alias en lecture seule, contre les Villes déjà chargées —
 * aucune requête, aucune double vérification d'existence.
 *
 * NE JAMAIS ajouter `"use client"` ici : ce module entre dans le bundle
 * navigateur via `components/storefront/city-picker.tsx` et reste consommé
 * côté serveur par `chargerDevis` (`@/lib/use-cases/devis`).
 *
 * NE JAMAIS importer `@/lib/db` (ni aucun module qui l'importe, comme
 * `@/lib/use-cases/livraison`) ici : un import serveur réintroduirait `pg`
 * (`require('dns')`) dans le bundle navigateur et casserait `next build`
 * (Turbopack). Le type `DeliveryCityOption` vient du module pur
 * `@/lib/use-cases/livraison-prix`.
 *
 * Non-buts : aucun autre paramètre ni chemin d'URL (seul le fragment
 * `?ville=` est écrit) ; aucune construction d'URL complète ; jamais de
 * redirect.
 */
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"

/**
 * Forme d'URL d'une Ville de livraison : le fragment exact
 * `?ville=<slug>`, slug percent-encodé. Entrée rétrécie au slug seul :
 * une Ville de livraison complète y est structurellement assignable,
 * aucun appelant n'a à choisir le champ. L'identifiant interne
 * n'apparaît jamais dans le fragment (ADR-0017).
 */
export function villeVersParam(ville: { slug: string }): string {
  return `?ville=${encodeURIComponent(ville.slug)}`
}

/**
 * Résolution pure de la Ville de livraison nommée dans une URL : le
 * **slug** d'abord (langage public, ADR-0017), puis l'identifiant interne
 * comme **alias en lecture seule** (liens émis avant le passage au slug),
 * contre les Villes déjà chargées — aucune requête, aucune double
 * vérification d'existence. Jamais de redirect.
 *
 * Répond d'un seul appel les deux faits de la Précédence : `urlVilleId`
 * (la ville résolue, `null` si absente ou inconnue) et `urlVilleFournie`
 * (la **présence** d'un `?ville=` non blanc). Absente / nulle / blanche →
 * `{ urlVilleId: null, urlVilleFournie: false }` ; slug ou alias →
 * `{ urlVilleId: <id>, urlVilleFournie: true }` ; valeur inconnue →
 * `{ urlVilleId: null, urlVilleFournie: true }` — la Sélection restera
 * « aucune », sans repli sur le profil. La valeur est rognée avant
 * correspondance.
 */
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
