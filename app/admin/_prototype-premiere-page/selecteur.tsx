"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect } from "react"

import { cn } from "@/lib/utils"

import { etatDepuis, type EtatPrototype } from "./etats"
import { VARIANTES, type CleVariante } from "./variantes"

/**
 * PROTOTYPE (#963) — la barre de bas d'écran : ← → commutent les trois
 * lectures de la boutique vide, et « Vide / Réel » compare avec le Tableau de
 * bord d'aujourd'hui. Montée seulement en développement (la page s'en charge) ;
 * l'état passe dans l'URL pour survivre au rechargement et se partager.
 */
export function SelecteurDePrototype({
  courante,
  etat,
}: {
  courante: CleVariante
  etat: EtatPrototype
}) {
  const router = useRouter()
  const pathname = usePathname()
  const parametres = useSearchParams()
  const index = VARIANTES.findIndex((variante) => variante.cle === courante)
  const variante = VARIANTES[index]!

  const naviguer = useCallback(
    (modifications: Record<string, string>) => {
      const suivants = new URLSearchParams(parametres.toString())
      for (const [cle, valeur] of Object.entries(modifications)) {
        suivants.set(cle, valeur)
      }
      router.replace(`${pathname}?${suivants.toString()}`, { scroll: false })
    },
    [parametres, pathname, router]
  )

  const tourner = useCallback(
    (pas: number) => {
      const suivante =
        VARIANTES[(index + pas + VARIANTES.length) % VARIANTES.length]!
      naviguer({ etat: "vide", variant: suivante.cle })
    },
    [index, naviguer]
  )

  useEffect(() => {
    if (etat !== "vide") return

    function surTouche(evenement: KeyboardEvent) {
      const cible = evenement.target as HTMLElement | null
      if (
        cible instanceof HTMLElement &&
        (cible.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))
      ) {
        return
      }
      if (evenement.key === "ArrowLeft") tourner(-1)
      if (evenement.key === "ArrowRight") tourner(1)
    }
    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  }, [etat, tourner])

  return (
    <div
      data-prototype-bar=""
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-3 md:inset-x-auto md:right-4"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground py-1 pl-1 text-xs text-background shadow-lg">
        {etat === "vide" ? (
          <>
            <button
              type="button"
              onClick={() => tourner(-1)}
              aria-label="Variante précédente"
              className="flex size-8 items-center justify-center rounded-full text-base hover:bg-background/15"
            >
              ←
            </button>
            <span className="max-w-[9.5rem] truncate px-1.5 font-medium sm:max-w-none sm:text-sm">
              {variante.cle} — {variante.nom}
            </span>
            <button
              type="button"
              onClick={() => tourner(1)}
              aria-label="Variante suivante"
              className="flex size-8 items-center justify-center rounded-full text-base hover:bg-background/15"
            >
              →
            </button>
          </>
        ) : (
          <span className="px-2 text-sm font-medium whitespace-nowrap">
            Tableau de bord actuel
          </span>
        )}

        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-background/25" />

        <div
          role="group"
          aria-label="État de la boutique"
          className="flex items-center gap-0.5"
        >
          {(["vide", "reel"] as const).map((valeur) => {
            const actif = etatDepuis(valeur) === etat
            return (
              <button
                key={valeur}
                type="button"
                onClick={() => naviguer({ etat: valeur })}
                aria-pressed={actif}
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-medium",
                  actif
                    ? "bg-background text-foreground"
                    : "text-background/80 hover:bg-background/15"
                )}
              >
                {valeur === "vide" ? "Vide" : "Réel"}
              </button>
            )
          })}
        </div>

        <span className="ml-1 hidden rounded-full bg-background/15 px-2 py-1 text-[0.6875rem] font-medium whitespace-nowrap md:inline">
          prototype #963
        </span>
      </div>
    </div>
  )
}
