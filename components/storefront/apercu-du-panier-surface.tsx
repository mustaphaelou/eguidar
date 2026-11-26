"use client"

import { useEffect, useRef } from "react"

import { CONTENEUR_BOUTIQUE } from "@/lib/conteneur-boutique"
import { cn } from "@/lib/utils"

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
        className="voile-floute fixed inset-0 z-0 bg-voile-sombre"
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
        className="voile-depoli rounded-be-[28px] max-lg:rounded-be-none absolute inset-x-0 inset-bs-0 z-10 pbs-11 shadow-[0_24px_48px_-28px_oklch(0.2_0_none/0.3)] ring-1 ring-hairline outline-none [--voile-depoli-flou:20px] [--voile-depoli-opacite:96%] [--voile-depoli-saturation:180%] max-lg:h-dvh"
      >
        <div
          className={cn(
            CONTENEUR_BOUTIQUE,
            "max-h-[calc(100dvh-2.75rem)] overflow-y-auto pbs-6 pbe-8"
          )}
        >
          {children}
        </div>
      </div>
    </>
  )
}
