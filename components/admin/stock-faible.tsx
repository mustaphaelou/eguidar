import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type LowStockVariant } from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

export function ListeDeStockFaible({
  stock,
  className,
}: {
  stock: LowStockVariant[]
  colonnesAuLg?: boolean
  className?: string
}) {
  if (stock.length === 0) return null

  return (
    <Table className={className}>
      <TableHeader>
        <TableRow className="border-hairline/60 hover:bg-transparent">
          <TableHead className="ps-(--card-spacing)">Produit</TableHead>
          <TableHead>Variante</TableHead>
          <TableHead className="hidden sm:table-cell">SKU</TableHead>
          <TableHead className="pe-(--card-spacing) text-end">Stock</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {stock.map((variante) => (
          <TableRow key={variante.id} className="relative border-hairline/60">
            <TableCell className="ps-(--card-spacing) font-medium">
              <Link
                href={`/admin/produits/${variante.productId}`}
                className="underline-offset-4 after:absolute after:inset-0 after:content-[''] [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
              >
                {variante.productName}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {variante.name}
            </TableCell>
            <TableCell className="hidden font-mono text-xs text-muted-foreground sm:table-cell">
              {variante.sku}
            </TableCell>
            <TableCell className="pe-(--card-spacing) text-end">
              <Badge
                variant={variante.stock === 0 ? "destructive" : "outline"}
                className={cn(
                  "whitespace-nowrap tabular-nums",
                  variante.stock > 0 &&
                    "border-border bg-muted/50 text-muted-foreground"
                )}
              >
                {variante.stock === 0
                  ? "Rupture"
                  : `${variante.stock} restants`}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
