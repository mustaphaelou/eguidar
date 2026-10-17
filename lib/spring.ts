export interface Ressort {
  readonly rigidite: number
  readonly amortissement: number
  readonly masse: number
}

export interface EtatRessort {
  readonly position: number
  readonly vitesse: number
}

export interface Echantillon {
  readonly position: number
  readonly instant: number
}

const SOUS_PAS_S = 1 / 240

/**
 * Un onglet resté en arrière-plan rend un dt énorme : le sous-pasage le garderait
 * stable, mais ferait des milliers d'itérations dans une seule image. On borne.
 * La borne est assez haute pour qu'un appareil lent garde sa vitesse réelle.
 */
const DT_MAX_S = 1 / 15

const EPS_TEMPS_S = 1e-9

const SEUIL_POSITION = 0.5
const SEUIL_VITESSE = 10
const FENETRE_VITESSE_MS = 100
const INSTANT_MIN_MS = 8

export function ressortDepuisReponse(
  reponse: number,
  rebond = 0,
  masse = 1
): Ressort {
  const omega = (2 * Math.PI) / reponse
  return {
    rigidite: omega * omega * masse,
    amortissement: 2 * (1 - rebond) * omega * masse,
    masse,
  }
}

export function avancerRessort(
  etat: EtatRessort,
  cible: number,
  ressort: Ressort,
  dt: number
): EtatRessort {
  let position = etat.position
  let vitesse = etat.vitesse
  let restant = Math.min(Math.max(dt, 0), DT_MAX_S)

  while (restant > EPS_TEMPS_S) {
    const pas = Math.min(SOUS_PAS_S, restant)
    restant -= pas
    const force =
      -ressort.rigidite * (position - cible) - ressort.amortissement * vitesse
    vitesse += (force / ressort.masse) * pas
    position += vitesse * pas
  }

  return { position, vitesse }
}

export function auRepos(
  etat: EtatRessort,
  cible: number,
  seuilPosition = SEUIL_POSITION,
  seuilVitesse = SEUIL_VITESSE
): boolean {
  return (
    Math.abs(etat.position - cible) < seuilPosition &&
    Math.abs(etat.vitesse) < seuilVitesse
  )
}

export function projeterMomentum(vitesse: number, taux = 0.998): number {
  return (vitesse / 1000) * (taux / (1 - taux))
}

export function elastique(
  depassement: number,
  dimension: number,
  constante = 0.55
): number {
  return (
    (depassement * dimension * constante) /
    (dimension + constante * Math.abs(depassement))
  )
}

export function vitesseDepuis(
  echantillons: readonly Echantillon[],
  fenetreMs = FENETRE_VITESSE_MS
): number {
  if (echantillons.length < 2) return 0

  const dernier = echantillons[echantillons.length - 1]!
  let premier = dernier
  for (let i = echantillons.length - 2; i >= 0; i--) {
    const candidat = echantillons[i]!
    if (dernier.instant - candidat.instant >= fenetreMs) break
    premier = candidat
  }

  const dt = dernier.instant - premier.instant
  if (dt < INSTANT_MIN_MS) return 0

  return ((dernier.position - premier.position) / dt) * 1000
}
