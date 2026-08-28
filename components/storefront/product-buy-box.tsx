"use client"

import { useState, useTransition } from "react"

import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ajouterArticleAuPanierAction } from "@/app/(boutique)/actions"
import { MOTIF_CAP_ATTEINTE } from "@/lib/panier"
import { MESSAGE_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ProductVariantDto } from "@/lib/use-cases/storefront"

const MAX_CHIPS = 6

export function ProductBuyBox({
  basePrice,
  variants,
  freeShipping,
}: {
  basePrice: number
  variants: ProductVariantDto[]
  freeShipping: boolean
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "")
  const [added, setAdded] = useState(false)
  const [capAtteint, setCapAtteint] = useState(false)
  const [isPending, startTransition] = useTransition()
  const selected = variants.find((variant) => variant.id === variantId)

  if (variants.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[28px] font-semibold">{formatPrice(basePrice)}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-destructive"
          />
          Rupture de stock
        </p>
        <Button disabled className="w-full rounded-full text-[17px]">
          Ajouter au panier
        </Button>
      </div>
    )
  }

  const price = formatPrice(basePrice + (selected?.priceDelta ?? 0))
  const stock = selected?.stock ?? 0
  const outOfStock = stock === 0

  function handleAddToCart() {
    if (!selected || outOfStock) return
    setAdded(false)
    setCapAtteint(false)
    startTransition(async () => {
      const resultat = await ajouterArticleAuPanierAction(selected.id, 1)
      if (resultat.ok) setAdded(true)
      else if (resultat.motif === MOTIF_CAP_ATTEINTE) setCapAtteint(true)
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {variants.length > 1 ? (
        <div className="flex flex-col gap-2">
          {variants.length <= MAX_CHIPS ? (
            <>
              <Label className="text-[14px]">Variante</Label>
              <div
                className="flex flex-wrap gap-2"
                role="group"
                aria-label="Variante"
              >
                {variants.map((variant) => (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => setVariantId(variant.id)}
                    className={cn(
                      "rounded-full border px-4 py-1.5 text-[14px] transition-colors",
                      variant.id === variantId
                        ? "border-foreground bg-foreground text-background"
                        : "border-foreground/15 text-muted-foreground hover:border-foreground hover:text-foreground"
                    )}
                  >
                    {variant.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <Label htmlFor="variant" className="text-[14px]">
                Variante
              </Label>
              <Select
                value={variantId}
                onValueChange={(value) => setVariantId(value ?? "")}
              >
                <SelectTrigger id="variant" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {variants.map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.name} —{" "}
                        {formatPrice(basePrice + variant.priceDelta)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      ) : null}

      <p className="text-[28px] font-semibold">{price}</p>

      <p className="text-sm leading-[1.4286] tracking-[-0.016em] text-muted-foreground">
        TVA 20% incluse · Paiement à la livraison
      </p>

      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        {outOfStock ? (
          <>
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-destructive"
            />
            Rupture de stock
          </>
        ) : (
          <>
            <span
              aria-hidden="true"
              className="size-2 rounded-full bg-emerald-500"
            />
            En stock ({stock} disponible{stock > 1 ? "s" : ""})
            {freeShipping ? " · Livraison offerte" : ""}
          </>
        )}
      </p>

      <Button
        onClick={handleAddToCart}
        disabled={outOfStock || isPending}
        className="w-full rounded-full text-[17px]"
      >
        {isPending ? "Ajout…" : "Ajouter au panier"}
      </Button>
      {added && <p className="text-sm text-emerald-600">Ajouté au panier</p>}
      {capAtteint && (
        <p role="alert" className="text-sm text-destructive">
          {MESSAGE_CAP_ATTEINTE}
        </p>
      )}
    </div>
  )
}
