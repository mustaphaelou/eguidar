"use client"

import { lireLeCompteurDuPanier } from "./lecture-du-panier-http"
import { useLectureDuPanier } from "./use-lecture-du-panier"

export function PanierBadge() {
  const compte = useLectureDuPanier(lireLeCompteurDuPanier)
  const itemCount = compte ?? 0

  if (itemCount === 0) return null

  return (
    <span className="absolute -inset-e-1 -inset-bs-1 flex items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-bold text-primary-foreground tabular-nums block-4 min-inline-4">
      {itemCount}
    </span>
  )
}
