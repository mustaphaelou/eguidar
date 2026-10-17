"use client"

import { useEffect, useRef } from "react"

export interface OptionsEcritureEnVol {
  envoyer(valeur: number, surFin: (ok: boolean) => void): void
  surRefus(): void
}

export function useEcritureEnVol(
  options: OptionsEcritureEnVol
): (valeur: number) => void {
  const enVol = useRef(false)
  const voulueEnAttente = useRef<number | null>(null)
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  function transmettre(valeur: number) {
    enVol.current = true
    optionsRef.current.envoyer(valeur, (ok) => {
      if (!ok) {
        enVol.current = false
        voulueEnAttente.current = null
        optionsRef.current.surRefus()
        return
      }
      const suivante = voulueEnAttente.current
      if (suivante !== null) {
        voulueEnAttente.current = null
        transmettre(suivante)
        return
      }
      enVol.current = false
    })
  }

  return function ecrire(valeur: number) {
    if (enVol.current) {
      voulueEnAttente.current = valeur
      return
    }
    transmettre(valeur)
  }
}
