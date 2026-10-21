import { getPriceBucket } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"

export type CleDeFiltre = "marque" | "categorie" | "prix"

const CHAMP_DE_FILTRE = {
  marque: "brand",
  categorie: "categorySlug",
  prix: "priceBucketId",
} as const satisfies Record<CleDeFiltre, keyof SearchFilters>

function premierValeur(
  valeur: string | string[] | undefined
): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

function valeursDeMarque(valeur: string | string[] | undefined): string[] {
  return valeur === undefined ? [] : Array.isArray(valeur) ? valeur : [valeur]
}

export function lireFiltres(
  params: Record<string, string | string[] | undefined>
): SearchFilters {
  const filtres: SearchFilters = {}

  const marques: string[] = []
  for (const brute of valeursDeMarque(params.marque)) {
    const marque = brute.trim()
    if (marque && !marques.includes(marque)) marques.push(marque)
  }
  if (marques.length > 0) filtres[CHAMP_DE_FILTRE.marque] = marques

  const categorie = premierValeur(params.categorie)?.trim()
  if (categorie) filtres[CHAMP_DE_FILTRE.categorie] = categorie

  const prix = premierValeur(params.prix)?.trim()
  if (prix && getPriceBucket(prix)) filtres[CHAMP_DE_FILTRE.prix] = prix

  return filtres
}

export function parametresDeFiltre(
  filtres: SearchFilters
): (readonly [CleDeFiltre, string])[] {
  const parametres: (readonly [CleDeFiltre, string])[] = []

  for (const marque of filtres[CHAMP_DE_FILTRE.marque] ?? []) {
    parametres.push(["marque", marque])
  }

  const categorie = filtres[CHAMP_DE_FILTRE.categorie]
  if (categorie) parametres.push(["categorie", categorie])

  const prix = filtres[CHAMP_DE_FILTRE.prix]
  if (prix) parametres.push(["prix", prix])

  return parametres
}
