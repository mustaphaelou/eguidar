import Image from "next/image"
import Link from "next/link"

import { DeliveryTruck02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { urlProduit, type CarteProduit } from "@/lib/carte-produit"
import { formatPrice } from "@/lib/money"

export function ProductCardItem({ product }: { product: CarteProduit }) {
  return (
    <Link
      href={urlProduit(product.slug)}
      className="group flex flex-col gap-2 rounded-2xl border p-3 transition-colors hover:border-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl bg-muted">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 20vw, (min-width: 640px) 33vw, 50vw"
            className="object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Aucune image
          </div>
        )}
        <div className="absolute top-2 left-2 flex flex-col gap-1">
          {product.freeShipping && (
            <Badge variant="secondary" className="gap-1">
              <HugeiconsIcon
                icon={DeliveryTruck02Icon}
                strokeWidth={2}
                className="size-3"
              />
              Livraison offerte
            </Badge>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 px-0.5">
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <p className="line-clamp-2 min-h-10 text-sm font-medium">
          {product.name}
        </p>
        <p className="text-base font-bold">{formatPrice(product.minPrice)}</p>
        <p className="text-xs text-muted-foreground">
          {product.totalStock > 0 ? (
            <span className="text-emerald-600">En stock</span>
          ) : (
            <span className="text-destructive">Rupture de stock</span>
          )}
        </p>
      </div>
    </Link>
  )
}
