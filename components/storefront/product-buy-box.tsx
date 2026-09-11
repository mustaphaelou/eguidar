"use client"

import { useEffect, useRef, useState } from "react"

import { BarreDAchat } from "@/components/storefront/barre-d-achat"
import type { EtatAjoutAuPanier } from "@/components/storefront/use-ajout-au-panier"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "@/components/storefront/use-mutations-du-panier"
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
import { cn } from "@/lib/utils"
import type { ProductVariantDto } from "@/lib/use-cases/storefront"

const MAX_CHIPS = 6

export function ProductBuyBox({
  minPrice,
  variants,
  freeShipping,
  port,
}: {
  minPrice: number
  variants: ProductVariantDto[]
  freeShipping: boolean
  port?: PortMutationsDuPanier
}) {
  const [variantId, setVariantId] = useState(variants[0]?.id ?? "")
  const { enAttente, messageRefus, ajoute, ajouter } = useMutationsDuPanier(port)
  const [barVisible, setBarVisible] = useState(false)
  const buyButtonRef = useRef<HTMLButtonElement>(null)

  const selected = variants.find((variant) => variant.id === variantId)
  const stock = selected?.stock ?? 0
  const outOfStock = stock === 0
  const prix = selected ? formatPrice(selected.prix) : ""
  const variantNom = variants.length > 1 ? selected?.name : undefined

  function lancerAjout() {
    if (!selected || outOfStock) return
    ajouter(selected.id, 1)
  }

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const bouton = buyButtonRef.current
    if (!bouton) return
    const observer = new IntersectionObserver(([entree]) =>
      setBarVisible(!entree.isIntersecting)
    )
    observer.observe(bouton)
    return () => observer.disconnect()
  }, [])

  if (variants.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[28px] font-semibold">{formatPrice(minPrice)}</p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-destructive"
          />
          Rupture de stock
        </p>
        <Button
          disabled
          size="xl"
          className="w-full rounded-full text-[17px] lg:h-9"
        >
          Ajouter au panier
        </Button>
      </div>
    )
  }

  const etat: EtatAjoutAuPanier = {
    prix,
    ajouter: lancerAjout,
    enAttente,
    ajoute,
    messageErreur: messageRefus,
    desactive: outOfStock || enAttente,
    variantNom,
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
                        {variant.name} — {formatPrice(variant.prix)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      ) : null}

      <p className="text-[28px] font-semibold">{prix}</p>

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
        ref={buyButtonRef}
        size="xl"
        onClick={lancerAjout}
        disabled={outOfStock || enAttente}
        className="w-full rounded-full text-[17px] lg:h-9"
      >
        {enAttente ? "Ajout…" : "Ajouter au panier"}
      </Button>
      {ajoute && <p className="text-sm text-emerald-600">Ajouté au panier</p>}
      {messageRefus && (
        <p role="alert" className="text-sm text-destructive">
          {messageRefus}
        </p>
      )}

      <BarreDAchat visible={barVisible} etat={etat} />
    </div>
  )
}
