"use client"

import { useState, useTransition } from "react"

import {
  ajouterArticleAuPanierAction,
  modifierQuantiteArticlePanierAction,
  retirerArticleDuPanierAction,
} from "@/app/(boutique)/actions"
import type { ResultatPanier } from "@/lib/panier"

export interface PortMutationsDuPanier {
  ajouter(variantId: string, quantity: number): Promise<ResultatPanier>
  modifier(variantId: string, quantity: number): Promise<ResultatPanier>
  retirer(variantId: string): Promise<ResultatPanier>
}

const portActionsPanier: PortMutationsDuPanier = {
  ajouter: ajouterArticleAuPanierAction,
  modifier: modifierQuantiteArticlePanierAction,
  retirer: retirerArticleDuPanierAction,
}

type SurFin = (resultat: ResultatPanier) => void

export function useMutationsDuPanier(
  port: PortMutationsDuPanier = portActionsPanier
): {
  enAttente: boolean
  messageRefus: string | undefined
  ajoute: boolean
  ajouter(variantId: string, quantity: number, surFin?: SurFin): void
  modifier(variantId: string, quantity: number, surFin?: SurFin): void
  retirer(variantId: string, surFin?: SurFin): void
} {
  const [enAttente, demarrer] = useTransition()
  const [ajoute, setAjoute] = useState(false)
  const [messageRefus, setMessageRefus] = useState<string>()

  function lancer(
    operation: () => Promise<ResultatPanier>,
    accuser: boolean,
    surFin?: SurFin
  ): void {
    setAjoute(false)
    setMessageRefus(undefined)
    demarrer(async () => {
      const resultat = await operation()
      if (resultat.ok) {
        if (accuser) setAjoute(true)
      } else {
        setMessageRefus(resultat.message)
      }
      surFin?.(resultat)
    })
  }

  return {
    enAttente,
    messageRefus,
    ajoute,
    ajouter(variantId, quantity, surFin) {
      lancer(() => port.ajouter(variantId, quantity), true, surFin)
    },
    modifier(variantId, quantity, surFin) {
      lancer(() => port.modifier(variantId, quantity), false, surFin)
    },
    retirer(variantId, surFin) {
      lancer(() => port.retirer(variantId), false, surFin)
    },
  }
}
