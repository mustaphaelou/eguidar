import { getPriceBucket, PRICE_BUCKETS } from "@/lib/price-buckets"
import type { SearchFilters } from "@/lib/search-params"

export interface OptionDeFiltre {
  value: string
  label: string
  count: number
  selected: boolean
}

interface DefinitionDeFiltre {
  champ: keyof SearchFilters
  multiple: boolean
  ariaLabel: (label: string) => string
  accepte?: (valeur: string) => boolean
}

const DEFINITIONS_DE_FILTRE = {
  marque: {
    champ: "brand",
    multiple: true,
    ariaLabel: (label: string) => `Retirer la marque ${label}`,
  },
  categorie: {
    champ: "categorySlug",
    multiple: false,
    ariaLabel: (label: string) => `Retirer la catégorie ${label}`,
  },
  prix: {
    champ: "priceBucketId",
    multiple: false,
    ariaLabel: (label: string) => `Retirer la tranche de prix ${label}`,
    accepte: (valeur: string) => getPriceBucket(valeur) !== undefined,
  },
} as const satisfies Record<string, DefinitionDeFiltre>

export type CleDeFiltre = keyof typeof DEFINITIONS_DE_FILTRE

export const CLES_DE_FILTRE = Object.keys(
  DEFINITIONS_DE_FILTRE
) as CleDeFiltre[]

export type OptionsDeFiltre = Record<CleDeFiltre, OptionDeFiltre[]>

export type RepartitionsDeFacettes = Record<CleDeFiltre, Record<string, number>>

export interface FiltreActif {
  cle: CleDeFiltre
  valeur: string
  label: string
  ariaLabel: string
}

function premiereValeur(
  valeur: string | string[] | undefined
): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

function valeursDuParametre(
  params: Record<string, string | string[] | undefined>,
  cle: CleDeFiltre
): string[] {
  const valeur = params[cle]
  if (valeur === undefined) return []
  return Array.isArray(valeur) ? valeur : [valeur]
}

function valeursDuChamp(filtres: SearchFilters, cle: CleDeFiltre): string[] {
  const valeur = filtres[DEFINITIONS_DE_FILTRE[cle].champ]
  if (Array.isArray(valeur)) return valeur
  return valeur ? [valeur] : []
}

function ecrireChamp<K extends keyof SearchFilters>(
  filtres: SearchFilters,
  champ: K,
  valeur: SearchFilters[K]
): SearchFilters {
  const suivants: SearchFilters = { ...filtres }
  suivants[champ] = valeur
  return suivants
}

function accepte(definition: DefinitionDeFiltre, valeur: string): boolean {
  return definition.accepte?.(valeur) ?? true
}

export function lireFiltres(
  params: Record<string, string | string[] | undefined>
): SearchFilters {
  let filtres: SearchFilters = {}

  for (const cle of CLES_DE_FILTRE) {
    const definition = DEFINITIONS_DE_FILTRE[cle]

    if (definition.multiple) {
      const valeurs: string[] = []
      for (const brute of valeursDuParametre(params, cle)) {
        const valeur = brute.trim()
        if (valeur && !valeurs.includes(valeur)) valeurs.push(valeur)
      }
      if (valeurs.length > 0) {
        filtres = ecrireChamp(filtres, definition.champ, valeurs)
      }
      continue
    }

    const valeur = premiereValeur(params[cle])?.trim()
    if (valeur && accepte(definition, valeur)) {
      filtres = ecrireChamp(filtres, definition.champ, valeur)
    }
  }

  return filtres
}

export function parametresDeFiltre(
  filtres: SearchFilters
): (readonly [CleDeFiltre, string])[] {
  const parametres: (readonly [CleDeFiltre, string])[] = []

  for (const cle of CLES_DE_FILTRE) {
    for (const valeur of valeursRetenues(filtres, cle)) {
      parametres.push([cle, valeur])
    }
  }

  return parametres
}

export function choisirValeur(
  filtres: SearchFilters,
  cle: CleDeFiltre,
  valeur: string
): SearchFilters {
  const definition = DEFINITIONS_DE_FILTRE[cle]

  if (!definition.multiple) {
    return ecrireChamp(filtres, definition.champ, valeur)
  }

  const valeurs = valeursDuChamp(filtres, cle)
  return ecrireChamp(
    filtres,
    definition.champ,
    valeurs.includes(valeur) ? [...valeurs] : [...valeurs, valeur]
  )
}

export function valeursRetenues(
  filtres: SearchFilters,
  cle: CleDeFiltre
): readonly string[] {
  return [...valeursDuChamp(filtres, cle)]
}

export function nombreDeFiltres(filtres: SearchFilters): number {
  let nombre = 0
  for (const cle of CLES_DE_FILTRE) {
    nombre += valeursRetenues(filtres, cle).length
  }
  return nombre
}

export function retirerFacette(
  filtres: SearchFilters,
  cle: CleDeFiltre
): SearchFilters {
  const restants = { ...filtres }
  delete restants[DEFINITIONS_DE_FILTRE[cle].champ]
  return restants
}

export function retirerValeur(
  filtres: SearchFilters,
  cle: CleDeFiltre,
  valeur: string
): SearchFilters {
  const definition = DEFINITIONS_DE_FILTRE[cle]

  if (definition.multiple) {
    const valeurs = valeursDuChamp(filtres, cle).filter(
      (candidate) => candidate !== valeur
    )
    if (valeurs.length === 0) return retirerFacette(filtres, cle)
    return ecrireChamp(filtres, definition.champ, valeurs)
  }

  return valeursRetenues(filtres, cle)[0] === valeur
    ? retirerFacette(filtres, cle)
    : { ...filtres }
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
  const filtresActifs: FiltreActif[] = []

  for (const cle of CLES_DE_FILTRE) {
    const { ariaLabel } = DEFINITIONS_DE_FILTRE[cle]
    for (const valeur of valeursRetenues(filtres, cle)) {
      const { label } = optionDeValeur(options[cle], valeur)
      filtresActifs.push({ cle, valeur, label, ariaLabel: ariaLabel(label) })
    }
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

export function optionsVisibles(
  options: readonly OptionDeFiltre[],
  plafond?: number,
  deplie = false
): { visibles: OptionDeFiltre[]; cachees: number } {
  const retenues = options.filter(
    (option) => option.count > 0 || option.selected
  )
  if (deplie || plafond === undefined) {
    return { visibles: retenues, cachees: 0 }
  }

  const visibles = retenues.filter(
    (option, index) => index < plafond || option.selected
  )
  return { visibles, cachees: retenues.length - visibles.length }
}
