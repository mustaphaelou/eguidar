"use client"

import { useState, useTransition } from "react"

import { ajouterArticleAuPanierAction } from "@/app/(boutique)/actions"
import { formatPrice } from "@/lib/money"
import type { ProductVariantDto } from "@/lib/use-cases/storefront"

export type EtatAjoutAuPanier = {
  prix: string
  ajouter: () => void
  enAttente?: boolean
  ajoute?: boolean
  messageErreur?: string
  desactive?: boolean
  variantNom?: string
}

export function useAjoutAuPanier({
  variants,
}: {
  variants: ProductVariantDto[]
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "")
  const [added, setAdded] = useState(false)
  const [messageErreur, setMessageErreur] = useState("")
  const [isPending, startTransition] = useTransition()
  const selected = variants.find((variant) => variant.id === variantId)
  const stock = selected?.stock ?? 0
  const outOfStock = stock === 0

  function ajouter() {
    if (!selected || outOfStock) return
    setAdded(false)
    setMessageErreur("")
    startTransition(async () => {
      const resultat = await ajouterArticleAuPanierAction(selected.id, 1)
      if (resultat.ok) setAdded(true)
      else setMessageErreur(resultat.message)
    })
  }

  return {
    variantId,
    setVariantId,
    stock,
    outOfStock,
    prix: selected ? formatPrice(selected.prix) : "",
    enAttente: isPending,
    ajoute: added,
    messageErreur: messageErreur || undefined,
    desactive: outOfStock || isPending,
    variantNom: variants.length > 1 ? selected?.name : undefined,
    ajouter,
  }
}
