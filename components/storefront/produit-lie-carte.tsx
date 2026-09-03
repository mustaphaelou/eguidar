"use client"

import Image from "next/image"
import Link from "next/link"
import { useState, useTransition } from "react"

import { ajouterArticleAuPanierAction } from "@/app/(boutique)/actions"
import { Button } from "@/components/ui/button"
import { MESSAGE_CAP_ATTEINTE, MOTIF_CAP_ATTEINTE } from "@/lib/panier-visiteur"
import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ProduitLie } from "@/lib/use-cases/blog"

export function ProduitLieCarte({ product }: { product: ProduitLie }) {
  const [ajoute, setAjoute] = useState(false)
  const [capAtteint, setCapAtteint] = useState(false)
  const [enAttente, demarrer] = useTransition()

  function ajouter() {
    if (!product.varianteId || enAttente) return
    setAjoute(false)
    setCapAtteint(false)
    demarrer(async () => {
      const resultat = await ajouterArticleAuPanierAction(
        product.varianteId!,
        1
      )
      if (resultat.ok) setAjoute(true)
      else if (resultat.motif === MOTIF_CAP_ATTEINTE) setCapAtteint(true)
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={`/produit/${product.slug}`}
        className="group flex flex-col gap-2"
      >
        <div className="relative aspect-square overflow-hidden rounded-2xl bg-muted">
          {product.image ? (
            <Image
              src={product.image}
              alt={product.name}
              fill
              sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
              {product.name}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-xs text-muted-foreground">{product.brand}</p>
          <p className="line-clamp-2 text-sm font-medium group-hover:text-link">
            {product.name}
          </p>
          <p className="text-sm font-semibold">
            {formatPrice(product.minPrice)}
          </p>
          <p
            className={cn(
              "text-xs",
              product.totalStock > 0
                ? "text-muted-foreground"
                : "text-destructive"
            )}
          >
            {product.totalStock > 0 ? "En stock" : "Rupture de stock"}
            {product.totalStock > 0 && product.freeShipping
              ? " · Livraison offerte"
              : ""}
          </p>
        </div>
      </Link>
      <Button
        size="sm"
        variant="secondary"
        onClick={ajouter}
        disabled={!product.varianteId || enAttente}
        className="w-full rounded-full"
      >
        {enAttente ? "Ajout…" : "Ajouter au panier"}
      </Button>
      {ajoute ? (
        <p className="text-xs text-emerald-600">Ajouté au panier</p>
      ) : null}
      {capAtteint ? (
        <p role="alert" className="text-xs text-destructive">
          {MESSAGE_CAP_ATTEINTE}
        </p>
      ) : null}
    </div>
  )
}
