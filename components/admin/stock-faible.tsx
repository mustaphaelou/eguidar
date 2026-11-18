import { LigneDeListe } from "@/components/admin/ligne-de-liste"
import { Badge } from "@/components/ui/badge"
import { type LowStockVariant } from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

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
              "border-border bg-muted/50 text-muted-foreground"
          )}
        >
          {variante.stock === 0 ? "Rupture" : `${variante.stock} restants`}
        </Badge>
      }
    />
  )
}

export function ListeDeStockFaible({
  stock,
  colonnesAuLg = false,
  className,
}: {
  stock: LowStockVariant[]
  colonnesAuLg?: boolean
  className?: string
}) {
  if (stock.length === 0) return null

  return (
    <ul
      className={cn(
        "[&>li]:border-t [&>li]:border-hairline/60",
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
