import { getPriceBucket, PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"

export type CleDeFiltre = "marque" | "categorie" | "prix"

export interface OptionDeFiltre {
  value: string
  label: string
  count: number
  selected: boolean
}

export type OptionsDeFiltre = Record<CleDeFiltre, OptionDeFiltre[]>

export type RepartitionsDeFacettes = Record<CleDeFiltre, Record<string, number>>

export interface FiltreActif {
  cle: CleDeFiltre
  valeur: string
  label: string
  ariaLabel: string
}

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

function assemblerOptions(
  valeurs: Iterable<string>,
  repartition: Record<string, number>,
  estRetenue: (valeur: string) => boolean,
  labelDe: (valeur: string) => string
): OptionDeFiltre[] {
  return [...valeurs]
    .map((value) => ({
      value,
      label: labelDe(value),
      count: repartition[value] ?? 0,
      selected: estRetenue(value),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "fr"))
}

function assemblerMarques(
  repartition: Record<string, number>,
  retenues: readonly string[]
): OptionDeFiltre[] {
  const valeurs = new Set([...Object.keys(repartition), ...retenues])
  return assemblerOptions(
    valeurs,
    repartition,
    (valeur) => retenues.includes(valeur),
    (valeur) => valeur
  )
}

function assemblerCategories(
  repartition: Record<string, number>,
  retenue: string | undefined,
  noms: ReadonlyMap<string, string>
): OptionDeFiltre[] {
  const valeurs = new Set(Object.keys(repartition))
  if (retenue) valeurs.add(retenue)
  return assemblerOptions(
    valeurs,
    repartition,
    (valeur) => valeur === retenue,
    (valeur) => noms.get(valeur) ?? valeur
  )
}

function assemblerTranches(
  repartition: Record<string, number>,
  retenue: string | undefined
): OptionDeFiltre[] {
  const tranches = PRICE_BUCKETS.map((bande) => ({
    value: bande.id,
    label: bande.label,
    count: repartition[bande.id] ?? 0,
    selected: bande.id === retenue,
  }))
  if (retenue && !getPriceBucket(retenue)) {
    tranches.push({
      value: retenue,
      label: retenue,
      count: 0,
      selected: true,
    })
  }
  return tranches
}

function optionDeValeur(
  options: readonly OptionDeFiltre[],
  valeur: string
): OptionDeFiltre {
  const option = options.find((candidate) => candidate.value === valeur)
  if (!option) {
    throw new Error(`Option de filtre introuvable : ${valeur}`)
  }
  return option
}

function projeterFiltresActifs(
  filtres: SearchFilters,
  options: OptionsDeFiltre
): FiltreActif[] {
  const filtresActifs: FiltreActif[] = (filtres.brand ?? []).map((valeur) => {
    const { label } = optionDeValeur(options.marque, valeur)
    return {
      cle: "marque",
      valeur,
      label,
      ariaLabel: `Retirer la marque ${label}`,
    }
  })

  const categorie = filtres.categorySlug
  if (categorie) {
    const { label } = optionDeValeur(options.categorie, categorie)
    filtresActifs.push({
      cle: "categorie",
      valeur: categorie,
      label,
      ariaLabel: `Retirer la catégorie ${label}`,
    })
  }

  const tranche = filtres.priceBucketId
  if (tranche) {
    const { label } = optionDeValeur(options.prix, tranche)
    filtresActifs.push({
      cle: "prix",
      valeur: tranche,
      label,
      ariaLabel: `Retirer la tranche de prix ${label}`,
    })
  }

  return filtresActifs
}

export function etatDesFiltres(
  repartitions: RepartitionsDeFacettes,
  filtres: SearchFilters,
  nomsDeCategories: ReadonlyMap<string, string>
): { options: OptionsDeFiltre; filtresActifs: FiltreActif[] } {
  const options: OptionsDeFiltre = {
    marque: assemblerMarques(repartitions.marque, filtres.brand ?? []),
    categorie: assemblerCategories(
      repartitions.categorie,
      filtres.categorySlug,
      nomsDeCategories
    ),
    prix: assemblerTranches(repartitions.prix, filtres.priceBucketId),
  }

  return { options, filtresActifs: projeterFiltresActifs(filtres, options) }
}
