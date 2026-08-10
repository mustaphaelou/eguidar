"use client"

import { useState } from "react"

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
import { formatPrice } from "@/lib/money"
import type { ProductVariantDto } from "@/lib/use-cases/storefront"

export function VariantPicker({
  basePrice,
  variants,
}: {
  basePrice: number
  variants: ProductVariantDto[]
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "")
  const selected = variants.find((variant) => variant.id === variantId)

  if (variants.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-2xl font-bold">{formatPrice(basePrice)}</p>
        <p className="text-sm text-destructive">Rupture de stock</p>
        <Button disabled className="w-full sm:w-auto">
          Ajouter au panier
        </Button>
      </div>
    )
  }

  const price = formatPrice(basePrice + (selected?.priceDelta ?? 0))
  const stock = selected?.stock ?? 0
  const outOfStock = stock === 0

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="variant">Variante</Label>
        <Select value={variantId} onValueChange={(value) => setVariantId(value ?? "")}>
          <SelectTrigger id="variant" className="w-full sm:w-64">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {variants.map((variant) => (
                <SelectItem key={variant.id} value={variant.id}>
                  {variant.name} — {formatPrice(basePrice + variant.priceDelta)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <p className="text-2xl font-bold">{price}</p>
      <p className="text-sm">
        {outOfStock ? (
          <span className="text-destructive">Rupture de stock</span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400">
            En stock ({stock} disponible{stock > 1 ? "s" : ""})
          </span>
        )}
      </p>
      <Button disabled={outOfStock} className="w-full sm:w-auto">
        Ajouter au panier
      </Button>
    </div>
  )
}
