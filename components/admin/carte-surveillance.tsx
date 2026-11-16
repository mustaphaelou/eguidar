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
import { type LowStockVariant } from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

import { LigneCalme } from "./ligne-calme"
import { LignesDAlerte, type CompteursDAlerte } from "./ligne-d-alerte"
import { ListeDeStockFaible } from "./stock-faible"

export function CarteSurveillance({
  compteurs,
  stock,
  className,
}: {
  compteurs: CompteursDAlerte
  stock: LowStockVariant[]
  className?: string
}) {
  const calme =
    compteurs.enRupture === 0 &&
    stock.length === 0 &&
    compteurs.sansAlt === 0 &&
    compteurs.echecs === 0

  return (
    <Card id="stock-faible" className={cn("scroll-mt-20", className)}>
      <CardHeader className="flex flex-col sm:grid">
        <CardTitle>À surveiller</CardTitle>
        <CardDescription>
          Les points qui demandent une action aujourd&apos;hui.
        </CardDescription>
        {stock.length > 0 ? (
          <CardAction className="hidden sm:block">
            <Button
              variant="outline"
              size="sm"
              render={
                <Link
                  href={buildProduitListingUrl({ tri: "stock", sens: "asc" })}
                />
              }
            >
              Voir les produits
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="px-0">
        {calme ? (
          <LigneCalme />
        ) : (
          <>
            <LignesDAlerte compteurs={compteurs} />
            <ListeDeStockFaible stock={stock} colonnesAuLg />
          </>
        )}
      </CardContent>
    </Card>
  )
}
