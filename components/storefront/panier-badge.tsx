"use client"

import { lireLeCompteurDuPanier } from "./lecture-du-panier-http"
import { useLectureDuPanier } from "./use-lecture-du-panier"

export function PanierBadge() {
  const compte = useLectureDuPanier(lireLeCompteurDuPanier)
  const itemCount = compte ?? 0

  if (itemCount === 0) return null

  return (
    <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground">
      {itemCount}
    </span>
  )
}
