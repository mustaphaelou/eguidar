"use client"

import { useEffect, useRef, useState } from "react"

import { BarreDAchat } from "@/components/storefront/barre-d-achat"
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

function varianteInitiale(variants: ProductVariantDto[]): string {
  if (variants.length === 0) return ""
  const disponibles = variants.filter((variant) => variant.stock > 0)
  const candidates = disponibles.length > 0 ? disponibles : variants
  return candidates.reduce((meilleure, variante) =>
    variante.prix < meilleure.prix ? variante : meilleure
  ).id
}

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
  const [variantId, setVariantId] = useState(() => varianteInitiale(variants))
  const { enAttente, messageRefus, ajoute, ajouter } =
    useMutationsDuPanier(port)
  const [barVisible, setBarVisible] = useState(false)
  const buyButtonRef = useRef<HTMLButtonElement>(null)

  const selected = variants.find((variant) => variant.id === variantId)
  const tousEpuises = variants.every((variant) => variant.stock === 0)
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

    let pageDefilee = false
    let actionDAchatVisible = true
    let piedDePageDansLaFenetre = false

    function appliquerLaVisibilite() {
      setBarVisible(
        pageDefilee && !actionDAchatVisible && !piedDePageDansLaFenetre
      )
    }

    function mesurerLaPage() {
      pageDefilee = window.scrollY > 0
      const piedDePage = document.querySelector("footer")
      if (piedDePage === null) {
        piedDePageDansLaFenetre = false
      } else {
        const rectangle = piedDePage.getBoundingClientRect()
        piedDePageDansLaFenetre =
          rectangle.top < window.innerHeight && rectangle.bottom > 0
      }
      appliquerLaVisibilite()
    }

    const observateur = new IntersectionObserver(([entree]) => {
      actionDAchatVisible = entree.isIntersecting
      mesurerLaPage()
    })
    observateur.observe(bouton)
    window.addEventListener("scroll", mesurerLaPage, { passive: true })
    mesurerLaPage()

    return () => {
      observateur.disconnect()
      window.removeEventListener("scroll", mesurerLaPage)
    }
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
          variant="secondary"
          size="xl"
          className="w-full rounded-full text-body lg:h-9"
        >
          Produit indisponible
        </Button>
      </div>
    )
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
                {variants.map((variant) => {
                  const epuisee = variant.stock === 0
                  return (
                    <button
                      key={variant.id}
                      type="button"
                      onClick={() => setVariantId(variant.id)}
                      aria-pressed={variant.id === variantId}
                      aria-label={
                        epuisee
                          ? `${variant.name} — rupture de stock`
                          : undefined
                      }
                      className={cn(
                        "rounded-full border px-4 py-1.5 text-[14px] transition-colors",
                        variant.id === variantId
                          ? "border-foreground bg-foreground text-background"
                          : "border-foreground/15 text-muted-foreground hover:border-foreground hover:text-foreground",
                        epuisee && "border-dashed",
                        epuisee &&
                          variant.id !== variantId &&
                          "text-muted-foreground/60"
                      )}
                    >
                      <span className={cn(epuisee && "line-through")}>
                        {variant.name}
                      </span>
                    </button>
                  )
                })}
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
                        {variant.stock === 0 ? " — rupture de stock" : ""}
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
            {tousEpuises ? "Rupture de stock" : "Variante en rupture de stock"}
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
        variant={outOfStock ? "secondary" : "default"}
        onClick={lancerAjout}
        disabled={outOfStock || enAttente}
        className="w-full rounded-full text-body lg:h-9"
      >
        {enAttente
          ? "Ajout…"
          : tousEpuises
            ? "Produit indisponible"
            : outOfStock
              ? "Variante indisponible"
              : "Ajouter au panier"}
      </Button>
      {ajoute && <p className="text-sm text-emerald-700">Ajouté au panier</p>}
      {messageRefus && (
        <p role="alert" className="text-sm text-destructive">
          {messageRefus}
        </p>
      )}

      <BarreDAchat
        visible={barVisible}
        faits={{
          varianteId: variantId,
          prix,
          variantNom,
          indisponible: outOfStock,
        }}
        port={port}
      />
    </div>
  )
}
