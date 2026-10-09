"use client"

import { useState } from "react"

import type { RécapitulatifRow } from "@/lib/recapitulatif-paiement"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"
import {
  projeterDevis,
  type DevisChargé,
  type SelectionDevis,
} from "@/lib/use-cases/devis-coeur"

export type { DevisChargé, SelectionDevis } from "@/lib/use-cases/devis-coeur"

export function useDevisSelection(devisChargé: DevisChargé): {
  villes: DeliveryCityOption[]
  selection: SelectionDevis
  rows: RécapitulatifRow[]
  choisir(villeId: string | null): void
  villeId: string | null
} {
  const [chargé] = useState(devisChargé)
  const [villeChoisie, setVilleChoisie] = useState<string | null>(
    chargé.villeInitiale
  )

  const projet = projeterDevis(chargé, villeChoisie)

  return {
    villes: projet.villes,
    selection: projet.selection,
    rows: projet.rows,
    villeId: projet.villeId,
    choisir: (villeId: string | null) => {
      setVilleChoisie(villeId)
    },
  }
}
