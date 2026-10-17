import {
  auRepos,
  avancerRessort,
  ressortDepuisReponse,
  type EtatRessort,
  type Ressort,
} from "@/lib/spring"

export const RESSORT_RETOUR = ressortDepuisReponse(0.35)

export const RESSORT_SORTIE = ressortDepuisReponse(0.3, 0.2)

export interface HorlogeAnimation {
  planifier(callback: (instant: number) => void): number
  annuler(identifiant: number): void
  maintenant(): number
}

const horlogeNavigateur: HorlogeAnimation = {
  planifier: (callback) => requestAnimationFrame(callback),
  annuler: (identifiant) => cancelAnimationFrame(identifiant),
  maintenant: () => performance.now(),
}

export interface OptionsAller {
  vitesse?: number
  ressort?: Ressort
  surFin?: () => void
}

export interface EntraineurRessort {
  poser(position: number, vitesse?: number): void
  /** Rejoint une cible en partant de l'état courant, y compris en plein vol. */
  aller(vers: number, options?: OptionsAller): void
  arreter(): void
  lire(): EtatRessort
}

export function creerEntraineur(
  surImage: (position: number, vitesse: number) => void,
  horloge: HorlogeAnimation = horlogeNavigateur
): EntraineurRessort {
  let etat: EtatRessort = { position: 0, vitesse: 0 }
  let cible = 0
  let ressort = RESSORT_RETOUR
  let frame: number | null = null
  let dernier = 0
  let surFin: (() => void) | undefined

  function publier() {
    surImage(etat.position, etat.vitesse)
  }

  function boucle(instant: number) {
    const dt = Math.max(0, (instant - dernier) / 1000)
    dernier = instant
    etat = avancerRessort(etat, cible, ressort, dt)
    publier()

    if (auRepos(etat, cible)) {
      frame = null
      etat = { position: cible, vitesse: 0 }
      publier()
      const fin = surFin
      surFin = undefined
      fin?.()
      return
    }

    frame = horloge.planifier(boucle)
  }

  function atteint() {
    etat = { position: cible, vitesse: 0 }
    publier()
    const fin = surFin
    surFin = undefined
    fin?.()
  }

  return {
    poser(position, vitesse = 0) {
      if (frame !== null) horloge.annuler(frame)
      frame = null
      etat = { position, vitesse }
      publier()
    },

    aller(vers, options = {}) {
      if (frame !== null) horloge.annuler(frame)
      frame = null

      cible = vers
      ressort = options.ressort ?? RESSORT_RETOUR
      surFin = options.surFin
      if (options.vitesse !== undefined) {
        etat = { position: etat.position, vitesse: options.vitesse }
      }

      if (auRepos(etat, cible)) {
        atteint()
        return
      }

      dernier = horloge.maintenant()
      frame = horloge.planifier(boucle)
    },

    arreter() {
      if (frame !== null) horloge.annuler(frame)
      frame = null
      surFin = undefined
    },

    lire() {
      return etat
    },
  }
}
