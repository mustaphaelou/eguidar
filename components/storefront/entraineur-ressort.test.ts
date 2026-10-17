import { describe, expect, it } from "vitest"

import { creerEntraineur, type HorlogeAnimation } from "./entraineur-ressort"

function horlogeManuelle(depart = 0) {
  let instant = depart
  let planifie: ((instant: number) => void) | null = null
  let prochaineImage = 1

  return {
    planifier(callback: (instant: number) => void): number {
      planifie = callback
      return prochaineImage++
    },
    annuler(): void {
      planifie = null
    },
    maintenant: () => instant,
    avancer(ms: number): void {
      instant += ms
      const frame = planifie
      planifie = null
      frame?.(instant)
    },
    get enAttente(): boolean {
      return planifie !== null
    },
  } satisfies HorlogeAnimation & {
    avancer(ms: number): void
    readonly enAttente: boolean
  }
}

function arriveAuRepos(
  horloge: ReturnType<typeof horlogeManuelle>,
  maxImages = 400
): void {
  for (let i = 0; i < maxImages && horloge.enAttente; i++) {
    horloge.avancer(1000 / 60)
  }
}

describe("creerEntraineur", () => {
  it("rejoint sa cible, fige la position exacte et prévient une seule fois", () => {
    const horloge = horlogeManuelle()
    const images: { position: number; vitesse: number }[] = []
    let fins = 0
    const entraineur = creerEntraineur(
      (position, vitesse) => images.push({ position, vitesse }),
      horloge
    )

    entraineur.aller(120, { surFin: () => fins++ })
    arriveAuRepos(horloge)

    expect(fins).toBe(1)
    expect(horloge.enAttente).toBe(false)
    expect(entraineur.lire()).toEqual({ position: 120, vitesse: 0 })
    expect(images[images.length - 1]).toEqual({ position: 120, vitesse: 0 })
  })

  it("prévient sans attendre une image quand la cible est déjà la position", () => {
    const horloge = horlogeManuelle()
    let fini = false
    const entraineur = creerEntraineur(() => {}, horloge)

    entraineur.aller(0, { surFin: () => (fini = true) })

    expect(fini).toBe(true)
    expect(horloge.enAttente).toBe(false)
  })

  it("donne la main au doigt d'un coup, en publiant la position et la vitesse", () => {
    const horloge = horlogeManuelle()
    const images: { position: number; vitesse: number }[] = []
    const entraineur = creerEntraineur(
      (position, vitesse) => images.push({ position, vitesse }),
      horloge
    )

    entraineur.poser(48, 900)

    expect(images).toEqual([{ position: 48, vitesse: 900 }])
    expect(entraineur.lire()).toEqual({ position: 48, vitesse: 900 })
    expect(horloge.enAttente).toBe(false)
  })

  it("annule un aller en vol par une pose, et sa fin ne vient jamais", () => {
    const horloge = horlogeManuelle()
    let fins = 0
    const entraineur = creerEntraineur(() => {}, horloge)

    entraineur.aller(200, { surFin: () => fins++ })
    horloge.avancer(1000 / 60)
    entraineur.poser(30, -400)

    expect(horloge.enAttente).toBe(false)
    arriveAuRepos(horloge)
    expect(fins).toBe(0)
    expect(entraineur.lire()).toEqual({ position: 30, vitesse: -400 })
  })

  it("re-cible sans sauter : le départ est la position courante, pas la cible", () => {
    const horloge = horlogeManuelle()
    let fins = 0
    const entraineur = creerEntraineur(() => {}, horloge)

    entraineur.aller(200, { surFin: () => fins++ })
    horloge.avancer(1000 / 60)
    const enVol = entraineur.lire().position

    entraineur.aller(0, { surFin: () => fins++ })

    expect(entraineur.lire().position).toBe(enVol)
    arriveAuRepos(horloge)
    expect(fins).toBe(1)
    expect(entraineur.lire()).toEqual({ position: 0, vitesse: 0 })
  })

  it("emporte la vitesse du relâchement dans la première image", () => {
    const horloge = horlogeManuelle()
    const images: { position: number; vitesse: number }[] = []
    const entraineur = creerEntraineur(
      (position, vitesse) => images.push({ position, vitesse }),
      horloge
    )

    entraineur.aller(0, { vitesse: 1000 })
    horloge.avancer(1000 / 60)

    const premiere = images[0]!
    expect(premiere.position).toBeGreaterThan(0)
    expect(premiere.vitesse).toBeGreaterThan(0)
  })

  it("éteint la fin en attente et la boucle sur arreter", () => {
    const horloge = horlogeManuelle()
    let fins = 0
    const entraineur = creerEntraineur(() => {}, horloge)

    entraineur.aller(200, { surFin: () => fins++ })
    horloge.avancer(1000 / 60)
    entraineur.arreter()

    expect(horloge.enAttente).toBe(false)
    arriveAuRepos(horloge)
    expect(fins).toBe(0)
  })

  it("ne remplace pas la fin d'un aller par celle d'un autre sans la poser", () => {
    const horloge = horlogeManuelle()
    const fins: string[] = []
    const entraineur = creerEntraineur(() => {}, horloge)

    entraineur.aller(200, { surFin: () => fins.push("premier") })
    horloge.avancer(1000 / 60)
    entraineur.aller(0)
    arriveAuRepos(horloge)

    expect(fins).toEqual([])
  })
})
