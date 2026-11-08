import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { buildProduitListingUrl } from "@/lib/produit-listing"
import {
  LOW_STOCK_THRESHOLD,
  type LowStockVariant,
} from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

import { ListeDeStockFaible } from "./liste-de-stock"

export function CarteStockFaible({
  stock,
  className,
}: {
  stock: LowStockVariant[]
  className?: string
}) {
  return (
    <Card id="stock-faible" className={cn("scroll-mt-20", className)}>
      <CardHeader className="flex flex-col sm:grid">
        <CardTitle>Stock faible (≤ {LOW_STOCK_THRESHOLD})</CardTitle>
        <CardDescription>Les variantes à réapprovisionner.</CardDescription>
        {stock.length > 0 ? (
          <CardAction className="hidden sm:block">
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={buildProduitListingUrl({
                    tri: "stock",
                    sens: "asc",
                  })}
                />
              }
            >
              Voir les produits
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        <ListeDeStockFaible stock={stock} />
      </CardContent>
    </Card>
  )
}
