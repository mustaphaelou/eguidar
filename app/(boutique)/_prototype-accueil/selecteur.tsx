"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback, useEffect } from "react"

import { cn } from "@/lib/utils"

import { VARIANTES, type CleVariante } from "./variantes"

/**
 * Prototype : la barre de bas d'écran qui commute les variantes, montée seulement en
 * développement (la page s'en charge). Le `?variant=` passe dans l'URL pour que l'écran se
 * partage et survive à un rechargement ; ← et → font pareil.
 */
export function SelecteurDeVariante({ courante }: { courante: CleVariante }) {
  const router = useRouter()
  const pathname = usePathname()
  const parametres = useSearchParams()
  const index = VARIANTES.findIndex((variante) => variante.cle === courante)
  const variante = VARIANTES[index]!

  const naviguer = useCallback(
    (pas: number) => {
      const suivante =
        VARIANTES[(index + pas + VARIANTES.length) % VARIANTES.length]!
      const suivants = new URLSearchParams(parametres.toString())
      suivants.set("variant", suivante.cle)
      router.replace(`${pathname}?${suivants.toString()}`, { scroll: false })
    },
    [index, parametres, pathname, router]
  )

  useEffect(() => {
    function surTouche(evenement: KeyboardEvent) {
      const cible = evenement.target as HTMLElement | null
      if (
        cible instanceof HTMLElement &&
        (cible.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(cible.tagName))
      ) {
        return
      }
      if (evenement.key === "ArrowLeft") naviguer(-1)
      if (evenement.key === "ArrowRight") naviguer(1)
    }
    window.addEventListener("keydown", surTouche)
    return () => window.removeEventListener("keydown", surTouche)
  }, [naviguer])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-foreground py-1 pr-1 pl-1 text-background shadow-lg">
        <button
          type="button"
          onClick={() => naviguer(-1)}
          aria-label="Variante précédente"
          className="flex size-8 items-center justify-center rounded-full text-lg hover:bg-background/15"
        >
          ←
        </button>
        <span className="px-2 text-sm font-medium whitespace-nowrap">
          {variante.cle} — {variante.nom}
        </span>
        <button
          type="button"
          onClick={() => naviguer(1)}
          aria-label="Variante suivante"
          className="flex size-8 items-center justify-center rounded-full text-lg hover:bg-background/15"
        >
          →
        </button>
        <span
          className={cn(
            "ml-1 hidden rounded-full bg-background/15 px-2 py-1 text-xs sm:inline"
          )}
        >
          prototype #641
        </span>
      </div>
    </div>
  )
}
