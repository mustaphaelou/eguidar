// @vitest-environment happy-dom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { elastique } from "@/lib/spring"

import type { EntraineurRessort, OptionsAller } from "./entraineur-ressort"
import { RESSORT_RETOUR, RESSORT_SORTIE } from "./entraineur-ressort"
import {
  useGlissementRetrait,
  type OptionsGlissementRetrait,
} from "./use-glissement-retrait"

;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
const roots: ReturnType<typeof createRoot>[] = []

beforeEach(() => {
  container = document.createElement("div")
  document.body.appendChild(container)
})

afterEach(() => {
  for (const root of roots) root.unmount()
  roots.length = 0
  container.remove()
  vi.restoreAllMocks()
})

const LARGEUR = 400

interface AppelAller extends OptionsAller {
  vers: number
}

/**
 * Un entraîneur de recette : il enregistre les poses et les allers au lieu de
 * poser des images. La décision du geste se borne ainsi à ce qu'elle demande.
 */
function creerFauxEntraineur() {
  const poses: { position: number; vitesse: number }[] = []
  const allers: AppelAller[] = []
  const arrets: true[] = []
  let etat = { position: 0, vitesse: 0 }

  return {
    poses,
    allers,
    arrets,
    fixerPosition(position: number) {
      etat = { position, vitesse: 0 }
    },
    creer(
      surImage: (position: number, vitesse: number) => void
    ): EntraineurRessort {
      return {
        poser(position, vitesse = 0) {
          etat = { position, vitesse }
          poses.push({ ...etat })
          surImage(position, vitesse)
        },
        aller(vers, options = {}) {
          allers.push({ vers, ...options })
        },
        arreter() {
          arrets.push(true)
        },
        lire: () => etat,
      }
    },
  }
}

type FauxEntraineur = ReturnType<typeof creerFauxEntraineur>

function monter(
  options: Partial<OptionsGlissementRetrait> & { onRetirer: () => void },
  preparer?: (faux: FauxEntraineur) => void
) {
  const faux = creerFauxEntraineur()
  preparer?.(faux)
  let instant = 0
  let resultat!: ReturnType<typeof useGlissementRetrait<HTMLDivElement>>

  const effectives: OptionsGlissementRetrait = {
    largeur: () => LARGEUR,
    entraineur: faux.creer,
    maintenant: () => instant,
    ...options,
  }

  function Sonde() {
    resultat = useGlissementRetrait<HTMLDivElement>(effectives)
    const { ref, gestes } = resultat
    return (
      <div data-testid="ligne" ref={ref} {...gestes}>
        <button type="button" data-testid="controle">
          +
        </button>
      </div>
    )
  }

  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<Sonde />))

  return {
    faux,
    ligne: container.querySelector<HTMLDivElement>('[data-testid="ligne"]')!,
    controle: container.querySelector<HTMLButtonElement>(
      '[data-testid="controle"]'
    )!,
    get resultat() {
      return resultat
    },
    avancerInstant(ms: number) {
      instant += ms
    },
  }
}

function evenement(
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {}
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: "touch",
    isPrimary: true,
    ...init,
  })
}

function poserDoigt(element: Element, x: number, y: number) {
  act(() => element.dispatchEvent(evenement("pointerdown", x, y)))
}

function bouger(element: Element, x: number, y: number) {
  act(() => element.dispatchEvent(evenement("pointermove", x, y)))
}

function lever(element: Element, x: number, y: number) {
  act(() => element.dispatchEvent(evenement("pointerup", x, y)))
}

function annuler(element: Element) {
  act(() => element.dispatchEvent(evenement("pointercancel", 0, 0)))
}

function avecMouvementReduit(actif: boolean) {
  vi.spyOn(window, "matchMedia").mockImplementation(
    (requete: string) =>
      ({
        matches: actif && requete.includes("prefers-reduced-motion"),
        media: requete,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList
  )
}

describe("useGlissementRetrait", () => {
  it("pose la ligne au toucher et la suit 1:1, sans animer entre deux doigts", () => {
    const { faux, ligne } = monter({ onRetirer: () => {} })

    poserDoigt(ligne, 100, 100)
    expect(faux.poses).toEqual([{ position: 0, vitesse: 0 }])

    // Sous le seuil d'axe, rien ne bouge : c'est encore un tap.
    bouger(ligne, 95, 100)
    expect(faux.poses).toHaveLength(1)

    bouger(ligne, 60, 100)
    expect(faux.poses.at(-1)).toEqual({ position: -40, vitesse: 0 })
    expect(ligne.style.transform).toBe("translate3d(-40px, 0, 0)")
  })

  it("repart de la position de présentation quand le doigt reprend une ligne en vol", () => {
    const { faux, ligne } = monter({ onRetirer: () => {} }, (f) =>
      f.fixerPosition(-80)
    )

    poserDoigt(ligne, 100, 100)
    expect(faux.poses[0]).toEqual({ position: -80, vitesse: 0 })

    bouger(ligne, 120, 100)
    expect(faux.poses.at(-1)).toEqual({ position: -60, vitesse: 0 })
  })

  it("abandonne la ligne quand l'axe vertical gagne, sans rien retirer", () => {
    const onRetirer = vi.fn()
    const { faux, ligne } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    bouger(ligne, 96, 104)
    bouger(ligne, 90, 130)
    bouger(ligne, 40, 130)
    lever(ligne, 40, 130)

    expect(onRetirer).not.toHaveBeenCalled()
    expect(faux.poses.every((pose) => pose.position === 0)).toBe(true)
    expect(faux.allers.at(-1)?.vers).toBe(0)
  })

  it("oppose l'élasticité au doigt passé l'origine, sans arrêt net", () => {
    const { faux, ligne } = monter({ onRetirer: () => {} })

    poserDoigt(ligne, 100, 100)
    bouger(ligne, 146, 100)

    const pose = faux.poses.at(-1)!
    expect(pose.position).toBeCloseTo(elastique(46, LARGEUR), 5)
    expect(pose.position).toBeGreaterThan(0)
    expect(pose.position).toBeLessThan(46)
  })

  it("commit un flick rapide près de l'origine, par le point projeté", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, avancerInstant } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    avancerInstant(20)
    bouger(ligne, 80, 100)
    avancerInstant(5)
    lever(ligne, 80, 100)

    expect(onRetirer).toHaveBeenCalledTimes(1)
    const sortie = faux.allers.at(-1)!
    expect(sortie.vers).toBe(-LARGEUR)
    expect(sortie.ressort).toBe(RESSORT_SORTIE)
    expect(sortie.vitesse).toBeCloseTo(-800, 5)
  })

  it("ramène un glissement lent en deçà du seuil", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, avancerInstant } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    avancerInstant(400)
    bouger(ligne, 60, 100)
    lever(ligne, 60, 100)

    expect(onRetirer).not.toHaveBeenCalled()
    const retour = faux.allers.at(-1)!
    expect(retour.vers).toBe(0)
    expect(retour.ressort).toBe(RESSORT_RETOUR)
    expect(retour.vitesse).toBe(0)
  })

  it("commit un glissement lent au-delà du seuil, sans vitesse", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, avancerInstant } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    avancerInstant(600)
    bouger(ligne, -80, 100)
    lever(ligne, -80, 100)

    expect(onRetirer).toHaveBeenCalledTimes(1)
    expect(faux.allers.at(-1)).toMatchObject({
      vers: -LARGEUR,
      ressort: RESSORT_SORTIE,
      vitesse: 0,
    })
  })

  it("revient à sa place quand le doigt repart vers la droite avant le relâchement", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, avancerInstant } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    avancerInstant(200)
    bouger(ligne, -80, 100)
    avancerInstant(80)
    bouger(ligne, -40, 100)
    avancerInstant(10)
    lever(ligne, -40, 100)

    expect(onRetirer).not.toHaveBeenCalled()
    const retour = faux.allers.at(-1)!
    expect(retour.vers).toBe(0)
    expect(retour.ressort).toBe(RESSORT_RETOUR)
    expect(retour.vitesse).toBeGreaterThan(0)
  })

  it("ne retire rien sur un tap sans axe et remet la ligne en place", () => {
    const onRetirer = vi.fn()
    const { faux, ligne } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    bouger(ligne, 98, 100)
    lever(ligne, 98, 100)

    expect(onRetirer).not.toHaveBeenCalled()
    expect(faux.allers.at(-1)?.vers).toBe(0)
  })

  it("remet la ligne sur une annulation du système, sans décider", () => {
    const onRetirer = vi.fn()
    const { faux, ligne } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    bouger(ligne, 60, 100)
    annuler(ligne)

    expect(onRetirer).not.toHaveBeenCalled()
    const retour = faux.allers.at(-1)!
    expect(retour.vers).toBe(0)
    expect(retour.ressort).toBe(RESSORT_RETOUR)
  })

  it("sort sans geste : le bouton Retirer emprunte la même trajectoire", () => {
    const onRetirer = vi.fn()
    const { faux, resultat } = monter({ onRetirer })

    act(() => resultat.sortir())

    expect(onRetirer).toHaveBeenCalledTimes(1)
    expect(faux.allers.at(-1)).toMatchObject({
      vers: -LARGEUR,
      ressort: RESSORT_SORTIE,
    })
  })

  it("restaure une ligne sortie, et le geste redevient possible", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, resultat } = monter({ onRetirer })

    act(() => resultat.sortir())
    act(() => resultat.restaurer())

    expect(faux.allers.at(-1)).toMatchObject({
      vers: 0,
      ressort: RESSORT_RETOUR,
    })

    poserDoigt(ligne, 100, 100)
    bouger(ligne, 60, 100)
    expect(faux.poses.at(-1)?.position).toBe(-40)
  })

  it("ne reprend pas une ligne déjà partie", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, avancerInstant } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    avancerInstant(20)
    bouger(ligne, 80, 100)
    avancerInstant(5)
    lever(ligne, 80, 100)
    expect(onRetirer).toHaveBeenCalledTimes(1)

    const posesApresSortie = faux.poses.length
    poserDoigt(ligne, 200, 100)
    bouger(ligne, 100, 100)
    lever(ligne, 100, 100)

    expect(onRetirer).toHaveBeenCalledTimes(1)
    expect(faux.poses).toHaveLength(posesApresSortie)
  })

  it("ne démarre pas de geste depuis un contrôle interne", () => {
    const onRetirer = vi.fn()
    const { faux, ligne, controle } = monter({ onRetirer })

    poserDoigt(controle, 100, 100)
    bouger(ligne, 60, 100)
    lever(ligne, 60, 100)

    expect(faux.poses).toEqual([])
    expect(onRetirer).not.toHaveBeenCalled()
  })

  it("ignore un clic secondaire de souris", () => {
    const { faux, ligne } = monter({ onRetirer: () => {} })

    act(() =>
      ligne.dispatchEvent(
        evenement("pointerdown", 100, 100, {
          pointerType: "mouse",
          button: 2,
        })
      )
    )
    bouger(ligne, 60, 100)

    expect(faux.poses).toEqual([])
  })

  it("sous mouvement réduit, sortir est un pas posé d'un coup, sans ressort", () => {
    avecMouvementReduit(true)
    const onRetirer = vi.fn()
    const { faux, ligne, avancerInstant } = monter({ onRetirer })

    poserDoigt(ligne, 100, 100)
    avancerInstant(200)
    bouger(ligne, -80, 100)
    avancerInstant(10)
    lever(ligne, -80, 100)

    expect(onRetirer).toHaveBeenCalledTimes(1)
    expect(faux.allers).toEqual([])
    expect(faux.poses.at(-1)).toEqual({ position: -LARGEUR, vitesse: 0 })
    expect(ligne.style.opacity).toBe("0")
  })

  it("sous mouvement réduit, revenir est un pas posé d'un coup", () => {
    avecMouvementReduit(true)
    const { faux, ligne, avancerInstant } = monter({ onRetirer: () => {} })

    poserDoigt(ligne, 100, 100)
    avancerInstant(400)
    bouger(ligne, 60, 100)
    lever(ligne, 60, 100)

    expect(faux.allers).toEqual([])
    expect(faux.poses.at(-1)).toEqual({ position: 0, vitesse: 0 })
  })
})
