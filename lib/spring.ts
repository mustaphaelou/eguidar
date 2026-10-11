/**
 * La physique du geste.
 *
 * Un ressort qu'une valeur anime vers sa cible, la projection qui dit où un
 * glissement va se poser, et l'élasticité qui résiste au doigt passé la borne.
 * Aucun DOM, aucun état, aucune horloge : le reste du module s'y branche et
 * reste éprouvable tout seul.
 *
 * Les paramètres sont ceux d'Apple — une réponse en secondes, et un ratio
 * d'amortissement où 1 est critique (aucun dépassement) et moins de 1 rebondit.
 */

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

/** Sous-pas fixe : l'intégration semi-implicite tient stable à 240 Hz. */
const SOUS_PAS_S = 1 / 240

/**
 * Un onglet resté en arrière-plan rend un dt énorme : le sous-pasage le garderait
 * stable, mais ferait des milliers d'itérations dans une seule image. On borne.
 * La borne est assez haute pour qu'un appareil lent garde sa vitesse réelle.
 */
const DT_MAX_S = 1 / 15

/** Assez petit pour jeter la poussière de virgule flottante du sous-pasage. */
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
    // `amortissement = 2 * ratio * omega * masse` est exactement la valeur
    // critique `2 * racine(rigidité * masse)` quand le ratio vaut 1 — le ressort
    // ne dépasse donc jamais sa cible pour le ratio critique, quelle que soit
    // la masse.
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

/**
 * Où le glissement se pose. `taux` de décélération : 0.998 pour la sensation
 * d'un défilement, 0.99 pour quelque chose de plus vif.
 */
export function projeterMomentum(vitesse: number, taux = 0.998): number {
  return (vitesse / 1000) * (taux / (1 - taux))
}

/**
 * La résistance du doigt passé une borne : l'écart réel croît moins vite que
 * l'écart demandé, et tend vers la dimension de la surface. Un arrêt net se
 * sent mort ; une résistance continue se sent vivante.
 */
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

/**
 * La vitesse du pointeur au relâchement, lue sur les derniers échantillons —
 * pas sur le dernier point, qui tremble.
 */
export function vitesseDepuis(
  echantillons: readonly Echantillon[],
  fenetreMs = FENETRE_VITESSE_MS
): number {
  if (echantillons.length < 2) return 0

  const dernier = echantillons[echantillons.length - 1]!
  // Le plus ancien point de la fenêtre : à défaut d'un point assez récent, le
  // dernier seul — un geste arrêté depuis plus que la fenêtre n'a plus de vitesse.
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
