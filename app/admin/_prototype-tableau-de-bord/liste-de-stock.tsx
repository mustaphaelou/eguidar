import { PackageIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { EmptyState } from "@/components/admin/empty-state"
import { Badge } from "@/components/ui/badge"
import {
  LOW_STOCK_THRESHOLD,
  type LowStockVariant,
} from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

import { LigneDeListe } from "./ligne-de-liste"

function LigneStock({ variante }: { variante: LowStockVariant }) {
  return (
    <LigneDeListe
      href={`/admin/produits/${variante.productId}`}
      titre={variante.productName}
      sousTitre={`${variante.name} — ${variante.sku}`}
      trailing={
        <Badge
          variant={variante.stock === 0 ? "destructive" : "outline"}
          className={cn(
            "whitespace-nowrap tabular-nums",
            variante.stock > 0 &&
              "border-amber-600/20 bg-amber-500/10 text-amber-700"
          )}
        >
          {variante.stock === 0 ? "Rupture" : `${variante.stock} restants`}
        </Badge>
      }
    />
  )
}

/**
 * PROTOTYPE (#964) — la liste du stock faible prend le même rythme que celle
 * des Commandes : hauteur de ligne, deux lignes à gauche, objet de valeur à
 * droite, lien qui prend la ligne entière. La pastille de stock reste la valeur
 * de la ligne ; elle n'a pas besoin d'un second chiffre à côté.
 *
 * `colonnesAuLg` sert la carte fusionnée de B : sur 1 100 px, une seule
 * colonne éloigne la pastille du nom du Produit de près d'un mètre d'écran.
 * Deux colonnes ramènent la ligne à la largeur de la carte du stock de A.
 */
export function ListeDeStockFaible({
  stock,
  vide = true,
  colonnesAuLg = false,
  className,
}: {
  stock: LowStockVariant[]
  /** Le cartouche vide n'a pas sa place dans une carte qui porte déjà des alertes. */
  vide?: boolean
  /** Une carte pleine largeur lit mieux en deux colonnes. */
  colonnesAuLg?: boolean
  className?: string
}) {
  if (stock.length === 0) {
    if (!vide) return null
    return (
      <EmptyState
        icon={
          <HugeiconsIcon
            icon={PackageIcon}
            strokeWidth={2}
            className="size-5"
          />
        }
        title="Aucune variante en stock faible."
        description={`Toutes les variantes ont plus de ${LOW_STOCK_THRESHOLD} unités disponibles.`}
        className="border-0 bg-transparent px-6 py-8"
      />
    )
  }

  return (
    <ul
      className={cn(
        "[&>li]:border-t",
        colonnesAuLg && "lg:grid lg:grid-cols-2 lg:gap-x-8",
        className
      )}
    >
      {stock.map((variante) => (
        <LigneStock key={variante.id} variante={variante} />
      ))}
    </ul>
  )
}
