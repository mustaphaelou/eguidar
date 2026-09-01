"use client"

import { useState, useTransition } from "react"

import { ajouterArticleAuPanierAction } from "@/app/(boutique)/actions"
import { formatPrice } from "@/lib/money"
import { MOTIF_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { prixVariante } from "@/lib/product-metrics"
import type { ProductVariantDto } from "@/lib/use-cases/storefront"

export type EtatAjoutAuPanier = {
  prix: string
  ajouter: () => void
  enAttente?: boolean
  ajoute?: boolean
  capAtteint?: boolean
  desactive?: boolean
  variantNom?: string
}

export function useAjoutAuPanier({
  basePrice,
  variants,
}: {
  basePrice: number
  variants: ProductVariantDto[]
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "")
  const [added, setAdded] = useState(false)
  const [capAtteint, setCapAtteint] = useState(false)
  const [isPending, startTransition] = useTransition()
  const selected = variants.find((variant) => variant.id === variantId)
  const stock = selected?.stock ?? 0
  const outOfStock = stock === 0

  function ajouter() {
    if (!selected || outOfStock) return
    setAdded(false)
    setCapAtteint(false)
    startTransition(async () => {
      const resultat = await ajouterArticleAuPanierAction(selected.id, 1)
      if (resultat.ok) setAdded(true)
      else if (resultat.motif === MOTIF_CAP_ATTEINTE) setCapAtteint(true)
    })
  }

  return {
    variantId,
    setVariantId,
    stock,
    outOfStock,
    prix: formatPrice(prixVariante(basePrice, selected?.priceDelta ?? 0)),
    enAttente: isPending,
    ajoute: added,
    capAtteint,
    desactive: outOfStock || isPending,
    variantNom: variants.length > 1 ? selected?.name : undefined,
    ajouter,
  }
}
