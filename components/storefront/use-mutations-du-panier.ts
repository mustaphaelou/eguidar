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

export function useMutationsDuPanier(
  port: PortMutationsDuPanier = portActionsPanier
): {
  enAttente: boolean
  messageRefus: string | undefined
  ajoute: boolean
  ajouter(variantId: string, quantity: number): void
  modifier(variantId: string, quantity: number): void
  retirer(variantId: string): void
} {
  const [enAttente, demarrer] = useTransition()
  const [ajoute, setAjoute] = useState(false)
  const [messageRefus, setMessageRefus] = useState<string>()

  function lancer(
    operation: () => Promise<ResultatPanier>,
    accuser: boolean
  ): void {
    setAjoute(false)
    setMessageRefus(undefined)
    demarrer(async () => {
      const resultat = await operation()
      if (!resultat.ok) {
        setMessageRefus(resultat.message)
        return
      }
      if (accuser) setAjoute(true)
    })
  }

  return {
    enAttente,
    messageRefus,
    ajoute,
    ajouter(variantId, quantity) {
      lancer(() => port.ajouter(variantId, quantity), true)
    },
    modifier(variantId, quantity) {
      lancer(() => port.modifier(variantId, quantity), false)
    },
    retirer(variantId) {
      lancer(() => port.retirer(variantId), false)
    },
  }
}
