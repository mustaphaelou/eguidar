import Link from "next/link"

import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"
import type { ProductCard } from "@/lib/use-cases/storefront"

export function HomeProductCard({ product }: { product: ProductCard }) {
  return (
    <Link href={`/produit/${product.slug}`} className="group flex flex-col gap-2">
      <div className="aspect-square overflow-hidden rounded-2xl bg-muted">
        {product.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
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
            product.totalStock > 0 ? "text-muted-foreground" : "text-destructive"
          )}
        >
          {product.totalStock > 0 ? "En stock" : "Rupture de stock"}
          {product.totalStock > 0 && product.freeShipping ? " · Livraison offerte" : ""}
        </p>
      </div>
    </Link>
  )
}
