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

import type { CompteursDAlerte } from "./donnees"
import { LigneCalme } from "./ligne-calme"
import { LignesDAlerte } from "./lignes-d-alerte"
import { ListeDeStockFaible } from "./liste-de-stock"

/**
 * PROTOTYPE (#964) — B fusionne les deux cartes de la troisième bande.
 *
 * La carte « Stock faible » ne garde pas son cadre : son contenu devient la
 * matière d'_À surveiller_, et les autres alertes (images sans alt,
 * automatisations) se glissent au-dessus quand elles existent. Une alerte
 * « Stock faible 6 » qui renvoie à un tableau six lignes plus bas n'existe plus.
 */
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
    compteurs.enRupture +
      compteurs.stockFaible +
      compteurs.sansAlt +
      compteurs.echecs ===
    0

  return (
    <Card id="stock-faible" className={cn("scroll-mt-20", className)}>
      <CardHeader className="flex flex-col sm:grid">
        <CardTitle>À surveiller</CardTitle>
        <CardDescription>
          Les points qui demandent une action aujourd’hui.
        </CardDescription>
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
        {calme ? (
          <LigneCalme
            detail={`Aucune variante sous ${LOW_STOCK_THRESHOLD} unités, aucune image sans texte alternatif, aucune automatisation en échec.`}
          />
        ) : (
          <>
            <LignesDAlerte
              compteurs={compteurs}
              stockFaibleHref="#stock-faible"
              masquerStockFaible
            />
            <ListeDeStockFaible stock={stock} vide={false} colonnesAuLg />
          </>
        )}
      </CardContent>
    </Card>
  )
}
