/**
 * PROTOTYPE (#963) — la période telle qu'elle apparaîtrait si la première page
 * gardait le graphique. Le vrai module (`lib/tableau-de-bord-periode.ts`) est
 * tranché par la recherche #962, pas ici ; ceci ne fait que rendre les trois
 * liens crédibles, avec `aria-current` et le défaut omis de l'URL.
 */
export const PERIODES = [
  { cle: "30j", libelle: "30 j" },
  { cle: "90j", libelle: "90 j" },
  { cle: "12mois", libelle: "12 mois" },
] as const

export type Periode = (typeof PERIODES)[number]["cle"]

export const PERIODE_PAR_DEFAUT: Periode = "12mois"

export function periodeDepuis(valeur: string | undefined): Periode {
  return PERIODES.some((periode) => periode.cle === valeur)
    ? (valeur as Periode)
    : PERIODE_PAR_DEFAUT
}

export function hrefPeriode(periode: Periode, cle: string): string {
  const parametres = new URLSearchParams({ etat: "vide", variant: cle })
  if (periode !== PERIODE_PAR_DEFAUT) parametres.set("periode", periode)
  return `/admin?${parametres.toString()}`
}
