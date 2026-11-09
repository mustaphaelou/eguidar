/**
 * La période du graphique du Tableau de bord : trois jetons d'URL, le défaut
 * omis, et les seaux que le cas d'usage relit. Module neutre — ni Next, ni
 * Prisma, ni React — pour que la page serveur, le cas d'usage et les tests
 * parlent la même grammaire.
 */

const TABLEAU_DE_BORD_PATH = "/admin"

export const PERIODE_VALUES = ["30j", "90j", "12mois"] as const

export type Periode = (typeof PERIODE_VALUES)[number]

export const PERIODE_PAR_DEFAUT: Periode = "30j"

export interface TableauDeBordParams {
  periode?: Periode
}

const LIBELLES: Record<Periode, { court: string; long: string }> = {
  "30j": { court: "30 j", long: "30 derniers jours" },
  "90j": { court: "90 j", long: "90 derniers jours" },
  "12mois": { court: "12 mois", long: "12 derniers mois" },
}

/** Le nombre de seaux de chaque période, du plus ancien au plus récent. */
export const NOMBRE_DE_SEAUX: Record<Periode, number> = {
  "30j": 30,
  "90j": 13,
  "12mois": 12,
}

export interface SeauDePeriode {
  /** La clé locale du seau : `AAAA-MM-JJ` (jour, ou lundi d'une semaine) ou `AAAA-MM` (mois). */
  cle: string
  /** Le début du seau, inclus. */
  debut: Date
  /** La fin du seau, exclue. */
  fin: Date
}

/**
 * Un point du graphique : le libellé de son seau et sa somme en centimes.
 * Type neutre, partagé par le cas d'usage et le composant client.
 */
export interface PointDeChiffreAffaires {
  label: string
  montant: number
}

const formatJour = new Intl.DateTimeFormat("fr-FR", {
  day: "2-digit",
  month: "2-digit",
})

const formatMois = new Intl.DateTimeFormat("fr-FR", { month: "short" })

function premier(valeur: string | string[] | undefined): string | undefined {
  return Array.isArray(valeur) ? valeur[0] : valeur
}

export function estPeriode(valeur: string | undefined): valeur is Periode {
  return (PERIODE_VALUES as readonly string[]).includes(valeur ?? "")
}

export function parsePeriode(
  raw: Record<string, string | string[] | undefined>
): Periode {
  const valeur = premier(raw.periode)
  return estPeriode(valeur) ? valeur : PERIODE_PAR_DEFAUT
}

export function libelleCourtPeriode(periode: Periode): string {
  return LIBELLES[periode].court
}

export function libelleLongPeriode(periode: Periode): string {
  return LIBELLES[periode].long
}

export function buildTableauDeBordUrl(
  params: TableauDeBordParams = {}
): string {
  const periode = params.periode ?? PERIODE_PAR_DEFAUT
  return periode === PERIODE_PAR_DEFAUT
    ? TABLEAU_DE_BORD_PATH
    : `${TABLEAU_DE_BORD_PATH}?periode=${periode}`
}

function debutDuJour(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function debutDeLaSemaine(date: Date): Date {
  const debut = debutDuJour(date)
  const decalage = (debut.getDay() + 6) % 7
  return new Date(
    debut.getFullYear(),
    debut.getMonth(),
    debut.getDate() - decalage
  )
}

function cleDuJour(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function cleDuMois(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
}

function construireJours(maintenant: Date): SeauDePeriode[] {
  const aujourdHui = debutDuJour(maintenant)
  return Array.from({ length: NOMBRE_DE_SEAUX["30j"] }, (_valeur, index) => {
    const jour = NOMBRE_DE_SEAUX["30j"] - 1 - index
    const debut = new Date(
      aujourdHui.getFullYear(),
      aujourdHui.getMonth(),
      aujourdHui.getDate() - jour
    )
    const fin = new Date(
      debut.getFullYear(),
      debut.getMonth(),
      debut.getDate() + 1
    )
    return { cle: cleDuJour(debut), debut, fin }
  })
}

function construireSemaines(maintenant: Date): SeauDePeriode[] {
  const lundiCourant = debutDeLaSemaine(maintenant)
  return Array.from({ length: NOMBRE_DE_SEAUX["90j"] }, (_valeur, index) => {
    const semaine = NOMBRE_DE_SEAUX["90j"] - 1 - index
    const debut = new Date(
      lundiCourant.getFullYear(),
      lundiCourant.getMonth(),
      lundiCourant.getDate() - semaine * 7
    )
    const fin = new Date(
      debut.getFullYear(),
      debut.getMonth(),
      debut.getDate() + 7
    )
    return { cle: cleDuJour(debut), debut, fin }
  })
}

function construireMois(maintenant: Date): SeauDePeriode[] {
  const annee = maintenant.getFullYear()
  const mois = maintenant.getMonth()
  return Array.from({ length: NOMBRE_DE_SEAUX["12mois"] }, (_valeur, index) => {
    const recul = NOMBRE_DE_SEAUX["12mois"] - 1 - index
    const debut = new Date(annee, mois - recul, 1)
    const fin = new Date(annee, mois - recul + 1, 1)
    return { cle: cleDuMois(debut), debut, fin }
  })
}

interface ConstructeurDePeriode {
  /** Les seaux de la période, du plus ancien au plus récent. */
  seaux(maintenant: Date): SeauDePeriode[]
  /** La clé du seau où tombe `date`. */
  cle(date: Date): string
  /** Le libellé court du seau qui commence à `debut`. */
  libelle(debut: Date): string
}

/**
 * Un constructeur par période : les trois fonctions qui dépendaient de la
 * période lisent la même table au lieu de répéter la même cascade.
 */
const CONSTRUCTEURS: Record<Periode, ConstructeurDePeriode> = {
  "30j": {
    seaux: construireJours,
    cle: cleDuJour,
    libelle: (debut) => formatJour.format(debut),
  },
  "90j": {
    seaux: construireSemaines,
    cle: (date) => cleDuJour(debutDeLaSemaine(date)),
    libelle: (debut) => formatJour.format(debut),
  },
  "12mois": {
    seaux: construireMois,
    cle: cleDuMois,
    libelle: (debut) => formatMois.format(debut),
  },
}

/**
 * Les seaux du graphique, du plus ancien au plus récent.
 *
 * — `30j` : trente jours calendaires, aujourd'hui compris, un seau par jour ;
 * — `90j` : douze semaines pleines et la semaine courante, un seau par lundi,
 *   ce qui couvre entre 84 et 90 jours selon le jour de la semaine ;
 * — `12mois` : douze mois calendaires, le mois courant compris.
 */
export function seauxDePeriode(
  periode: Periode,
  maintenant: Date = new Date()
): SeauDePeriode[] {
  return CONSTRUCTEURS[periode].seaux(maintenant)
}

/** La clé du seau de `periode` où tombe `date`. */
export function cleDuSeau(periode: Periode, date: Date): string {
  return CONSTRUCTEURS[periode].cle(date)
}

/** Le libellé court d'un seau : `09/11` pour un jour ou une semaine, `nov.` pour un mois. */
export function libelleDuSeau(periode: Periode, debut: Date): string {
  return CONSTRUCTEURS[periode].libelle(debut)
}
