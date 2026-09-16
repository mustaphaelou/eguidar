"use client"

import Image from "next/image"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { urlProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ProduitLie } from "@/lib/use-cases/blog"
import {
  useMutationsDuPanier,
  type PortMutationsDuPanier,
} from "./use-mutations-du-panier"

export function ProduitLieCarte({
  product,
  port,
}: {
  product: ProduitLie
  port?: PortMutationsDuPanier
}) {
  const { enAttente, messageRefus, ajoute, ajouter } =
    useMutationsDuPanier(port)

  function lancerAjout() {
    if (!product.varianteId || enAttente) return
    ajouter(product.varianteId, 1)
  }

  return (
    <div className="flex flex-col gap-2">
      <Link
        href={urlProduit(product.slug)}
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
        onClick={lancerAjout}
        disabled={!product.varianteId || enAttente}
        className="w-full rounded-full"
      >
        {enAttente ? "Ajout…" : "Ajouter au panier"}
      </Button>
      {ajoute ? (
        <p className="text-xs text-emerald-600">Ajouté au panier</p>
      ) : null}
      {messageRefus ? (
        <p role="alert" className="text-xs text-destructive">
          {messageRefus}
        </p>
      ) : null}
    </div>
  )
}
