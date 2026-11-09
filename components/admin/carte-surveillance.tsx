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

import { LigneCalme } from "./ligne-calme"
import { LignesDAlerte, type CompteursDAlerte } from "./ligne-d-alerte"
import { ListeDeStockFaible } from "./stock-faible"

/**
 * La troisième bande, fusionnée : les alertes qui comptent passent au-dessus du
 * stock faible, qui devient la liste commune. L'alerte « Stock faible » ne se
 * répète plus au-dessus du tableau qu'elle désigne, et tout à zéro se dit une
 * seule fois.
 *
 * L'en-tête porte `flex flex-col sm:grid` : masquer le `CardAction` en
 * `display: none` retire l'action de la grille de `CardHeader` et ferait écrire
 * le titre à la verticale. Le flex de base le laisse se placer normalement.
 */
export function CarteSurveillance({
  compteurs,
  stock,
  className,
}: {
  compteurs: CompteursDAlerte & { stockFaible: number }
  stock: LowStockVariant[]
  className?: string
}) {
  const calme =
    compteurs.enRupture === 0 &&
    compteurs.stockFaible === 0 &&
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
          <LigneCalme
            detail={`Aucune variante sous ${LOW_STOCK_THRESHOLD} unités, aucune image sans texte alternatif, aucune automatisation en échec.`}
          />
        ) : (
          <>
            <LignesDAlerte compteurs={compteurs} />
            <ListeDeStockFaible stock={stock} vide={false} colonnesAuLg />
          </>
        )}
      </CardContent>
    </Card>
  )
}
