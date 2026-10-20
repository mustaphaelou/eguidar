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
  const [villeChoisie, setVilleChoisie] = useState<string | null>(
    devisChargé.villeInitiale
  )

  // Les faits suivent toujours le Devis courant : après un refus (Devis périmé),
  // la page re-rend des faits frais et le récapitulatif comme le total caché
  // s'y accordent. Seul le choix de Ville appartient au Client et survit.
  const projet = projeterDevis(devisChargé, villeChoisie)

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
