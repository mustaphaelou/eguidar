"use client"

import { useSyncExternalStore } from "react"

const abonnes = new Set<() => void>()
let version = 0

export function sAbonnerAuxChangementsDuPanier(abonne: () => void): () => void {
  abonnes.add(abonne)
  return () => {
    abonnes.delete(abonne)
  }
}

export function signalerUnChangementDuPanier(): void {
  version += 1
  for (const abonne of [...abonnes]) abonne()
}

function lireLaVersion(): number {
  return version
}

export function usePanierQuiChange(): number {
  return useSyncExternalStore(
    sAbonnerAuxChangementsDuPanier,
    lireLaVersion,
    lireLaVersion
  )
}
