import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  const nombreAlertes =
    (compteurs.enRupture > 0 ? 1 : 0) +
    (compteurs.sansAlt > 0 ? 1 : 0) +
    (compteurs.echecs > 0 ? 1 : 0)

  const calme = nombreAlertes === 0 && stock.length === 0
  const aLesDeux = nombreAlertes > 0 && stock.length > 0

  return (
    <Card
      id="stock-faible"
      className={cn("scroll-mt-20 border border-border/60", className)}
    >
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
        ) : aLesDeux ? (
          <Tabs defaultValue="alertes" className="gap-0">
            <div className="px-(--card-spacing) pb-3">
              <TabsList>
                <TabsTrigger value="alertes">
                  Alertes
                  <Badge variant="secondary" className="tabular-nums">
                    {nombreAlertes}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="stock">
                  Stock faible
                  <Badge variant="secondary" className="tabular-nums">
                    {stock.length}
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="alertes" keepMounted>
              <LignesDAlerte compteurs={compteurs} />
            </TabsContent>
            <TabsContent value="stock" keepMounted>
              <ListeDeStockFaible stock={stock} />
            </TabsContent>
          </Tabs>
        ) : nombreAlertes > 0 ? (
          <LignesDAlerte compteurs={compteurs} />
        ) : (
          <ListeDeStockFaible stock={stock} />
        )}
      </CardContent>
    </Card>
  )
}
