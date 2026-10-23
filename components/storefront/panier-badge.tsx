"use client"

import { useEffect, useState } from "react"

import { lireLeCompteurDuPanier } from "./lecture-du-panier-http"
import { usePanierQuiChange } from "./panier-qui-change"

export function PanierBadge() {
  const version = usePanierQuiChange()
  const [itemCount, setItemCount] = useState(0)

  useEffect(() => {
    const controleur = new AbortController()
    void lireLeCompteurDuPanier(controleur.signal).then((compte) => {
      if (compte === null || controleur.signal.aborted) return
      setItemCount(compte)
    })
    return () => controleur.abort()
  }, [version])

  if (itemCount === 0) return null

  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground">
      {itemCount}
    </span>
  )
}
