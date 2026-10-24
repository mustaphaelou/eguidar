"use client"

import { useEffect, useRef } from "react"

import {
  ID_APERCU_DU_PANIER,
  ID_TITRE_APERCU_DU_PANIER,
} from "./apercu-du-panier-identifiants"

const SELECTEUR_FOCALISABLES = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",")

function elementsFocalisables(racine: HTMLElement): HTMLElement[] {
  return Array.from(
    racine.querySelectorAll<HTMLElement>(SELECTEUR_FOCALISABLES)
  )
}

export function ApercuDuPanierSurface({
  children,
  onClose,
}: {
  children: React.ReactNode
  onClose: () => void
}) {
  const surfaceRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface) return

    surface.focus({ preventScroll: true })

    const surTouche = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return

      const focalisables = elementsFocalisables(surface)
      if (focalisables.length === 0) {
        event.preventDefault()
        surface.focus({ preventScroll: true })
        return
      }

      const premier = focalisables[0]
      const dernier = focalisables[focalisables.length - 1]
      const actif = document.activeElement
      if (event.shiftKey) {
        if (
          actif === premier ||
          actif === surface ||
          !surface.contains(actif)
        ) {
          event.preventDefault()
          dernier.focus({ preventScroll: true })
        }
        return
      }
      if (actif === dernier || actif === surface || !surface.contains(actif)) {
        event.preventDefault()
        premier.focus({ preventScroll: true })
      }
    }

    function surDefilement() {
      onClose()
    }

    document.addEventListener("keydown", surTouche)
    window.addEventListener("scroll", surDefilement, { passive: true })
    return () => {
      document.removeEventListener("keydown", surTouche)
      window.removeEventListener("scroll", surDefilement)
    }
  }, [onClose])

  return (
    <>
      <div
        data-slot="voile-sombre"
        aria-hidden="true"
        className="fixed inset-0 z-0 bg-voile-sombre"
        onClick={onClose}
      />

      <div
        ref={surfaceRef}
        id={ID_APERCU_DU_PANIER}
        data-slot="apercu-du-panier"
        role="dialog"
        aria-modal="true"
        aria-labelledby={ID_TITRE_APERCU_DU_PANIER}
        tabIndex={-1}
        className="voile-depoli absolute inset-x-0 top-0 z-10 rounded-b-[28px] pt-11 shadow-2xl outline-none [--voile-depoli-flou:60px] [--voile-depoli-opacite:94%] [--voile-depoli-saturation:120%] max-lg:h-dvh max-lg:rounded-b-none"
      >
        <div className="mx-auto max-h-[calc(100dvh-2.75rem)] max-w-[1024px] overflow-y-auto px-4 pt-6 pb-8 sm:px-[22px]">
          {children}
        </div>
      </div>
    </>
  )
}
