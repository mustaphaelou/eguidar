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
      className="group flex flex-col gap-5 active:scale-[0.99] motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out"
    >
      <div className="relative aspect-square overflow-clip rounded-carte bg-muted">
        {product.image ? (
          <Image
            src={product.image}
            alt={product.name}
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover group-hover:scale-[1.0161] motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Aucune image
          </div>
        )}
        {product.freeShipping ? (
          <Badge
            variant="secondary"
            className="absolute inset-s-3 inset-bs-3 gap-1"
          >
            <HugeiconsIcon icon={DeliveryTruck02Icon} strokeWidth={2} />
            Livraison offerte
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs text-muted-foreground">{product.brand}</p>
        <p className="line-clamp-2 min-h-11 text-lg leading-tight font-semibold tracking-[0.007em]">
          {product.name}
        </p>
        <p className="text-base font-semibold tabular-nums">
          {formatPrice(product.minPrice)}
        </p>
        <p className="text-xs text-muted-foreground">
          {product.totalStock > 0 ? "En stock" : "Rupture de stock"}
        </p>
      </div>
    </Link>
  )
}
