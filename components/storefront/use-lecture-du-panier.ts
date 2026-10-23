"use client"

import { useEffect, useState } from "react"

import { usePanierQuiChange } from "./panier-qui-change"

/**
 * La lecture HTTP du Panier d'une surface cliente : relancée à chaque
 * changement du Panier, abandonnée au démontage ou à la lecture suivante, et
 * silencieuse en cas d'échec (`null`).
 */
export function useLectureDuPanier<T>(
  lire: (signal: AbortSignal) => Promise<T | null>
): T | null {
  const version = usePanierQuiChange()
  const [resultat, setResultat] = useState<T | null>(null)

  useEffect(() => {
    const controleur = new AbortController()
    void lire(controleur.signal).then((corps) => {
      if (corps === null || controleur.signal.aborted) return
      setResultat(corps)
    })
    return () => controleur.abort()
  }, [lire, version])

  return resultat
}
