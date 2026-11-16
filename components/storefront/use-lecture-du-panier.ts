"use client"

import { useEffect, useState } from "react"

import { usePanierQuiChange } from "./panier-qui-change"

export function useLectureDuPanier<T>(
  lire: (signal: AbortSignal) => Promise<T | null>
): T | null {
  const version = usePanierQuiChange()
  const [resultat, setResultat] = useState<{
    version: number
    valeur: T
  } | null>(null)

  useEffect(() => {
    const controleur = new AbortController()
    void lire(controleur.signal)
      .then((corps) => {
        if (corps === null || controleur.signal.aborted) return
        setResultat({ version, valeur: corps })
      })
      .catch(() => {})
    return () => controleur.abort()
  }, [lire, version])

  return resultat?.version === version ? resultat.valeur : null
}
