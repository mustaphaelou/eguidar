import { describe, expect, it } from "vitest"

import {
  avancerRessort,
  auRepos,
  elastique,
  projeterMomentum,
  ressortDepuisReponse,
  vitesseDepuis,
  type EtatRessort,
  type Ressort,
} from "./spring"

/** Au repos, le ressort est à moins d'un demi-pixel de sa cible. */
const SEUIL_REPOS = 0.5

/** Anime jusqu'au repos, en posant des pas de 1/60 s comme le fait rAF. */
function animer(
  etat: EtatRessort,
  cible: number,
  ressort: Ressort,
  maxSecondes = 5
): { etat: EtatRessort; secondes: number } {
  let courant = etat
  let secondes = 0
  while (secondes < maxSecondes) {
    if (auRepos(courant, cible)) return { etat: courant, secondes }
    courant = avancerRessort(courant, cible, ressort, 1 / 60)
    secondes += 1 / 60
  }
  return { etat: courant, secondes }
}

describe("ressortDepuisReponse", () => {
  it("pose l'amortissement critique, qui ne dépasse jamais sa cible", () => {
    const ressort = ressortDepuisReponse(0.4)

    expect(ressort.amortissement).toBeCloseTo(
      2 * Math.sqrt(ressort.rigidite * ressort.masse),
      10
    )
  })

  it("amortit moins pour un rebond demandé", () => {
    const critique = ressortDepuisReponse(0.4)
    const rebond = ressortDepuisReponse(0.4, 0.2)

    expect(rebond.amortissement).toBeLessThan(critique.amortissement)
  })
})

describe("avancerRessort", () => {
  it("va vers sa cible et s'y immobilise", () => {
    const ressort = ressortDepuisReponse(0.4)
    const { etat, secondes } = animer({ position: 120, vitesse: 0 }, 0, ressort)

    expect(auRepos(etat, 0)).toBe(true)
    expect(Math.abs(etat.position)).toBeLessThan(SEUIL_REPOS)
    expect(secondes).toBeLessThan(1)
  })

  it("part de la vitesse qu'on lui donne, sans la recalculer", () => {
    const ressort = ressortDepuisReponse(0.4)

    const lance = avancerRessort(
      { position: 0, vitesse: 800 },
      0,
      ressort,
      1 / 60
    )
    const immobile = avancerRessort(
      { position: 0, vitesse: 0 },
      0,
      ressort,
      1 / 60
    )

    // Le geste entre dans l'animation : le ressort emporte son élan dans le sens
    // du mouvement, là où un ressort lâché sur place ne bougerait pas.
    expect(lance.position).toBeGreaterThan(1)
    expect(immobile.position).toBe(0)
  })

  it("ne dépasse pas sa cible quand l'amortissement est critique", () => {
    const ressort = ressortDepuisReponse(0.4, 0)
    let courant: EtatRessort = { position: 200, vitesse: -1500 }
    let maximum = courant.position

    for (let i = 0; i < 400; i++) {
      courant = avancerRessort(courant, 0, ressort, 1 / 60)
      maximum = Math.max(maximum, courant.position)
    }

    expect(maximum).toBeLessThanOrEqual(200)
  })

  it("dépasse sa cible quand le ressort rebondit", () => {
    const ressort = ressortDepuisReponse(0.4, 0.2)
    let courant: EtatRessort = { position: 200, vitesse: 0 }
    let minimum = courant.position

    for (let i = 0; i < 400; i++) {
      courant = avancerRessort(courant, 0, ressort, 1 / 60)
      minimum = Math.min(minimum, courant.position)
    }

    expect(minimum).toBeLessThan(0)
  })

  it("donne le même résultat quelle que soit la taille du pas", () => {
    const ressort = ressortDepuisReponse(0.4)

    const grand = avancerRessort(
      { position: 90, vitesse: 300 },
      0,
      ressort,
      1 / 15
    )

    let pasParPas = { position: 90, vitesse: 300 }
    for (let i = 0; i < 4; i++) {
      pasParPas = avancerRessort(pasParPas, 0, ressort, 1 / 60)
    }

    expect(grand.position).toBeCloseTo(pasParPas.position, 5)
  })

  it("ignore un pas énorme plutôt que d'exploser", () => {
    const ressort = ressortDepuisReponse(0.4)

    const etat = avancerRessort({ position: 50, vitesse: 0 }, 0, ressort, 5)

    expect(Number.isFinite(etat.position)).toBe(true)
    expect(Math.abs(etat.position)).toBeLessThanOrEqual(50)
  })
})

describe("auRepos", () => {
  it("reconnait un ressort immobilisé sur sa cible", () => {
    expect(auRepos({ position: 0, vitesse: 0 }, 0)).toBe(true)
  })

  it("ne confond pas une valeur proche avec un repos si ça bouge encore", () => {
    expect(auRepos({ position: 0.1, vitesse: 400 }, 0)).toBe(false)
  })

  it("reconnait un ressort encore loin de sa cible", () => {
    expect(auRepos({ position: 40, vitesse: 0 }, 0)).toBe(false)
  })
})

describe("projeterMomentum", () => {
  it("projette un glissement vers l'avant, dans le sens du mouvement", () => {
    expect(projeterMomentum(1500)).toBeGreaterThan(0)
    expect(projeterMomentum(-1500)).toBeLessThan(0)
  })

  it("projette plus loin quand le geste est plus rapide", () => {
    expect(projeterMomentum(2400)).toBeGreaterThan(projeterMomentum(1200))
  })

  it("ne projette rien sur un geste à l'arrêt", () => {
    expect(projeterMomentum(0)).toBe(0)
  })

  it("projette une distance finie : la friction arrête toujours", () => {
    expect(projeterMomentum(1e9)).toBeLessThan(Number.POSITIVE_INFINITY)
  })
})

describe("elastique", () => {
  it("cède moins que l'écart demandé", () => {
    expect(elastique(300, 400)).toBeLessThan(300)
  })

  it("résiste d'autant plus que l'écart est grand", () => {
    const petit = elastique(50, 400) / 50
    const grand = elastique(200, 400) / 200

    expect(grand).toBeLessThan(petit)
  })

  it("tende vers la dimension de la surface sans jamais l'atteindre", () => {
    expect(elastique(1e6, 400)).toBeLessThan(400)
  })

  it("rend un symétrique, pour que la borne résiste des deux côtés", () => {
    expect(elastique(-120, 400)).toBeCloseTo(-elastique(120, 400), 10)
  })
})

describe("vitesseDepuis", () => {
  it("lit la vitesse sur les derniers points, pas sur le dernier seul", () => {
    const echantillons = [
      { position: 0, instant: 0 },
      { position: 10, instant: 10 },
      { position: 20, instant: 20 },
    ]

    expect(vitesseDepuis(echantillons)).toBeCloseTo(1000, 5)
  })

  it("ignore un point ancien qui n'appartient plus à la fenêtre", () => {
    const echantillons = [
      { position: -5000, instant: 0 },
      { position: 10, instant: 90 },
      { position: 20, instant: 100 },
    ]

    expect(vitesseDepuis(echantillons)).toBeCloseTo(1000, 5)
  })

  it("reste muette sans deux points", () => {
    expect(vitesseDepuis([])).toBe(0)
    expect(vitesseDepuis([{ position: 4, instant: 12 }])).toBe(0)
  })

  it("reste muette quand les deux points sont trop proches pour une vitesse", () => {
    const echantillons = [
      { position: 10, instant: 1000 },
      { position: 11, instant: 1001 },
    ]

    expect(vitesseDepuis(echantillons)).toBe(0)
  })

  it("reste muette quand le geste s'est arrêté avant la fenêtre", () => {
    // Un doigt posé, un glissement rapide, puis une longue immobilité avant le
    // relâchement : la vitesse du geste n'est plus celle du relâchement.
    const echantillons = [
      { position: 0, instant: 0 },
      { position: 300, instant: 50 },
      { position: 300, instant: 900 },
    ]

    expect(vitesseDepuis(echantillons)).toBe(0)
  })

  it("suit le sens du geste", () => {
    const echantillons = [
      { position: 20, instant: 0 },
      { position: 10, instant: 20 },
    ]

    expect(vitesseDepuis(echantillons)).toBeLessThan(0)
  })
})
