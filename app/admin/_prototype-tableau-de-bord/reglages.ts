/**
 * PROTOTYPE (#964) — l'URL du prototype, et rien de plus. Le vrai module
 * `lib/tableau-de-bord-periode.ts` est tranché par la recherche #962 ; ici, le
 * grammaire est la même (trois jetons, un défaut omis, un constructeur) mais il
 * porte aussi les réglages qui ne vivent que le temps du prototype.
 */
import { clePrototypeDepuis, type ClePrototype } from "./variantes"

export const PERIODES = [
  { cle: "30j", court: "30 j", long: "30 jours", nom: "30 derniers jours" },
  { cle: "90j", court: "90 j", long: "90 jours", nom: "90 derniers jours" },
  {
    cle: "12mois",
    court: "12 mois",
    long: "12 mois",
    nom: "12 derniers mois",
  },
] as const

export type Periode = (typeof PERIODES)[number]["cle"]

export const PERIODE_PAR_DEFAUT: Periode = "30j"

export type Etiquettes = "court" | "long"
export type Axe = "epure" | "trait"
export type Montants = "reel" | "cinq" | "six"
export type Commandes = "reel" | "actif"
export type Alertes = "reel" | "calme"

export interface Reglages {
  variante: ClePrototype
  periode: Periode
  etiquettes: Etiquettes
  axe: Axe
  montants: Montants
  commandes: Commandes
  alertes: Alertes
}

export type ParametresBruts = Record<string, string | string[] | undefined>

const DEFAUTS = {
  periode: PERIODE_PAR_DEFAUT,
  etiquettes: "court",
  axe: "epure",
  montants: "reel",
  commandes: "reel",
  alertes: "reel",
} as const satisfies Omit<Reglages, "variante">

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

function parmi<T extends string>(
  valeur: string | undefined,
  valeurs: readonly T[],
  defaut: T
): T {
  return valeurs.includes(valeur as T) ? (valeur as T) : defaut
}

export function periodeDepuis(valeur: string | undefined): Periode {
  return parmi(
    valeur,
    PERIODES.map((periode) => periode.cle),
    PERIODE_PAR_DEFAUT
  )
}

export function libellePeriode(periode: Periode, etiquettes: Etiquettes) {
  const choix = PERIODES.find((candidat) => candidat.cle === periode)!
  return etiquettes === "long" ? choix.long : choix.court
}

export function lireReglages(params: ParametresBruts): Reglages {
  return {
    variante: clePrototypeDepuis(premier(params.variant)),
    periode: periodeDepuis(premier(params.periode)),
    etiquettes: parmi(
      premier(params.etiquettes),
      ["court", "long"] as const,
      DEFAUTS.etiquettes
    ),
    axe: parmi(premier(params.axe), ["epure", "trait"] as const, DEFAUTS.axe),
    montants: parmi(
      premier(params.montants),
      ["reel", "cinq", "six"] as const,
      DEFAUTS.montants
    ),
    commandes: parmi(
      premier(params.commandes),
      ["reel", "actif"] as const,
      DEFAUTS.commandes
    ),
    alertes: parmi(
      premier(params.alertes),
      ["reel", "calme"] as const,
      DEFAUTS.alertes
    ),
  }
}

/**
 * Construit l'URL du prototype en omettant les défauts, comme les listes de
 * l'Administration. Le `variant` reste toujours présent pour qu'un lien partagé
 * ne retombe pas sur la variante par défaut d'une autre session.
 */
export function hrefPrototype(
  reglages: Reglages,
  modifications: Partial<Reglages> = {}
): string {
  const suivants: Reglages = { ...reglages, ...modifications }
  const parametres = new URLSearchParams()
  parametres.set("variant", suivants.variante)
  if (suivants.periode !== DEFAUTS.periode) {
    parametres.set("periode", suivants.periode)
  }
  if (suivants.etiquettes !== DEFAUTS.etiquettes) {
    parametres.set("etiquettes", suivants.etiquettes)
  }
  if (suivants.axe !== DEFAUTS.axe) parametres.set("axe", suivants.axe)
  if (suivants.montants !== DEFAUTS.montants) {
    parametres.set("montants", suivants.montants)
  }
  if (suivants.commandes !== DEFAUTS.commandes) {
    parametres.set("commandes", suivants.commandes)
  }
  if (suivants.alertes !== DEFAUTS.alertes) {
    parametres.set("alertes", suivants.alertes)
  }
  return `/admin?${parametres.toString()}`
}
