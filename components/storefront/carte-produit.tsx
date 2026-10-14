import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import {
  urlProduit,
  type CarteProduit as CarteProduitDonnees,
} from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"

export function CarteProduit({
  product,
  action,
}: {
  product: CarteProduitDonnees
  action?: ReactNode
}) {
  const carte = (
    <Link
      href={urlProduit(product.slug)}
      className="group flex flex-col gap-2 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out motion-safe:active:scale-[0.99] motion-reduce:transform-none motion-reduce:transition-none"
    >
      <div className="relative aspect-square overflow-clip rounded-2xl bg-muted">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-out motion-reduce:transform-none motion-reduce:transition-none motion-safe:[@media(hover:hover)_and_(pointer:fine)]:group-hover:scale-[1.02]"
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
        <p className="text-sm font-semibold">{formatPrice(product.minPrice)}</p>
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
  )

  if (!action) return carte

  return (
    <div className="flex flex-col gap-2">
      {carte}
      {action}
    </div>
  )
}
