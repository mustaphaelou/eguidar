"use client"

import { useEffect, useRef } from "react"
import type { PointerEvent as ReactPointerEvent, RefObject } from "react"

import {
  elastique,
  projeterMomentum,
  vitesseDepuis,
  type Echantillon,
} from "@/lib/spring"

import {
  creerEntraineur,
  RESSORT_RETOUR,
  RESSORT_SORTIE,
  type EntraineurRessort,
} from "./entraineur-ressort"

const SEUIL_AXE_PX = 10

const PART_RETRAIT = 0.4

const FENETRE_ECHANTILLONS_MS = 120

const CONTROLES =
  "button, a, input, textarea, select, [role='button'], [role='link']"

export interface OptionsGlissementRetrait {
  onRetirer(): void
  largeur?(element: HTMLElement): number
  entraineur?(
    surImage: (position: number, vitesse: number) => void
  ): EntraineurRessort
  maintenant?(): number
}

interface Geste {
  pointerId: number
  departX: number
  departY: number
  base: number
  axe: "indécis" | "horizontal" | "vertical"
  echantillons: Echantillon[]
}

function mouvementReduit(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

export function useGlissementRetrait<E extends HTMLElement = HTMLElement>(
  options: OptionsGlissementRetrait
): {
  ref: RefObject<E | null>
  gestes: {
    onPointerDown(event: ReactPointerEvent<E>): void
    onPointerMove(event: ReactPointerEvent<E>): void
    onPointerUp(event: ReactPointerEvent<E>): void
    onPointerCancel(event: ReactPointerEvent<E>): void
  }
  sortir(): void
  restaurer(): void
} {
  const ref = useRef<E>(null)
  const optionsRef = useRef(options)
  const gesteRef = useRef<Geste | null>(null)
  const partieRef = useRef(false)
  const entraineurRef = useRef<EntraineurRessort | null>(null)

  useEffect(() => {
    optionsRef.current = options
  })

  useEffect(
    () => () => {
      entraineurRef.current?.arreter()
      gesteRef.current = null
    },
    []
  )

  function largeurDe(element: HTMLElement): number {
    const mesuree = optionsRef.current.largeur?.(element)
    if (mesuree !== undefined) return mesuree
    return element.offsetWidth || element.getBoundingClientRect().width || 0
  }

  function instantDe(event: ReactPointerEvent<E>): number {
    const maintenant = optionsRef.current.maintenant
    if (maintenant) return maintenant()
    return event.timeStamp > 0 ? event.timeStamp : performance.now()
  }

  function obtenirEntraineur(): EntraineurRessort {
    if (!entraineurRef.current) {
      const surImage = (position: number) => {
        const element = ref.current
        if (element)
          element.style.transform = `translate3d(${position}px, 0, 0)`
      }
      entraineurRef.current = (
        optionsRef.current.entraineur ?? creerEntraineur
      )(surImage)
    }
    return entraineurRef.current
  }

  function remettreEnPlace() {
    obtenirEntraineur().aller(0, { ressort: RESSORT_RETOUR })
  }

  function fondre() {
    const element = ref.current
    if (!element) return
    element.style.transition = "opacity 150ms ease-out"
    element.style.opacity = "0"
  }

  function partir(dimension: number, vitesse?: number) {
    const entraineur = obtenirEntraineur()
    if (mouvementReduit()) {
      entraineur.poser(-dimension, 0)
      fondre()
    } else if (vitesse !== undefined) {
      entraineur.aller(-dimension, { vitesse, ressort: RESSORT_SORTIE })
    } else {
      entraineur.aller(-dimension, { ressort: RESSORT_SORTIE })
    }
    partieRef.current = true
    optionsRef.current.onRetirer()
  }

  function decider(position: number, vitesse: number) {
    const element = ref.current
    const dimension = element ? largeurDe(element) : 0
    const projete = position + projeterMomentum(vitesse)
    const sortie = projete < -dimension * PART_RETRAIT

    if (sortie) {
      partir(dimension, vitesse)
      return
    }

    const entraineur = obtenirEntraineur()
    if (mouvementReduit()) {
      entraineur.poser(0, 0)
    } else {
      entraineur.aller(0, { vitesse, ressort: RESSORT_RETOUR })
    }
  }

  function capturer(pointerId: number) {
    const element = ref.current
    if (!element?.setPointerCapture) return
    try {
      element.setPointerCapture(pointerId)
    } catch {}
  }

  function surPointerDown(event: ReactPointerEvent<E>) {
    if (gesteRef.current || partieRef.current) return
    if (event.pointerType === "mouse" && event.button !== 0) return
    if (event.target instanceof Element && event.target.closest(CONTROLES))
      return

    const entraineur = obtenirEntraineur()
    const depart = entraineur.lire()
    entraineur.poser(depart.position, depart.vitesse)

    gesteRef.current = {
      pointerId: event.pointerId,
      departX: event.clientX,
      departY: event.clientY,
      base: depart.position,
      axe: "indécis",
      echantillons: [{ position: depart.position, instant: instantDe(event) }],
    }
  }

  function surPointerMove(event: ReactPointerEvent<E>) {
    const geste = gesteRef.current
    if (!geste || event.pointerId !== geste.pointerId) return

    const dx = event.clientX - geste.departX
    const dy = event.clientY - geste.departY

    if (geste.axe === "indécis") {
      if (Math.abs(dx) < SEUIL_AXE_PX && Math.abs(dy) < SEUIL_AXE_PX) return
      if (Math.abs(dx) >= Math.abs(dy)) {
        geste.axe = "horizontal"
        capturer(event.pointerId)
      } else {
        geste.axe = "vertical"
        return
      }
    }
    if (geste.axe !== "horizontal") return

    const element = ref.current
    const dimension = element ? largeurDe(element) : 0
    const brut = geste.base + dx
    const position =
      brut > 0 && dimension > 0 ? elastique(brut, dimension) : brut
    const instant = instantDe(event)

    geste.echantillons.push({ position, instant })
    geste.echantillons = geste.echantillons.filter(
      (echantillon) => instant - echantillon.instant <= FENETRE_ECHANTILLONS_MS
    )

    obtenirEntraineur().poser(position)
  }

  function surPointerUp(event: ReactPointerEvent<E>) {
    const geste = gesteRef.current
    if (!geste || event.pointerId !== geste.pointerId) return
    gesteRef.current = null

    if (geste.axe !== "horizontal") {
      remettreEnPlace()
      return
    }

    const derniere = geste.echantillons[geste.echantillons.length - 1]!
    geste.echantillons.push({
      position: derniere.position,
      instant: instantDe(event),
    })
    decider(derniere.position, vitesseDepuis(geste.echantillons))
  }

  function surPointerCancel(event: ReactPointerEvent<E>) {
    const geste = gesteRef.current
    if (!geste || event.pointerId !== geste.pointerId) return
    gesteRef.current = null

    if (geste.axe !== "horizontal") {
      remettreEnPlace()
      return
    }

    const derniere = geste.echantillons[geste.echantillons.length - 1]!
    geste.echantillons.push({
      position: derniere.position,
      instant: instantDe(event),
    })
    obtenirEntraineur().aller(0, {
      vitesse: vitesseDepuis(geste.echantillons),
      ressort: RESSORT_RETOUR,
    })
  }

  return {
    ref,
    gestes: {
      onPointerDown: surPointerDown,
      onPointerMove: surPointerMove,
      onPointerUp: surPointerUp,
      onPointerCancel: surPointerCancel,
    },
    sortir() {
      if (partieRef.current) return
      const element = ref.current
      partir(element ? largeurDe(element) : 0)
    },
    restaurer() {
      partieRef.current = false
      const element = ref.current
      if (element) {
        element.style.transition = ""
        element.style.opacity = ""
      }
      const entraineur = obtenirEntraineur()
      if (mouvementReduit()) {
        entraineur.poser(0, 0)
      } else {
        entraineur.aller(0, { ressort: RESSORT_RETOUR })
      }
    },
  }
}
