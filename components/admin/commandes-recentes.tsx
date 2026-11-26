import Link from "next/link"

import {
  ArrowRight01Icon,
  ShoppingBasket02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatPrice } from "@/lib/money"
import type { RecentOrder } from "@/lib/use-cases/admin-dashboard"
import { cn, shortOrderId } from "@/lib/utils"

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

function libelleDuPied(total: number): string {
  return total > 1 ? `Voir les ${total} commandes` : "Voir la commande"
}

export function CommandesRecentes({
  commandes,
  total,
  className,
}: {
  commandes: RecentOrder[]
  total: number
  className?: string
}) {
  return (
    <Card
      className={cn("flex h-full flex-col border border-border/60", className)}
    >
      <CardHeader>
        <CardTitle>Commandes récentes</CardTitle>
        <CardDescription>Les dernières Commandes reçues.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-0">
        {commandes.length === 0 ? (
          <Empty className="border-0 bg-transparent px-(--card-spacing) py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon
                  icon={ShoppingBasket02Icon}
                  strokeWidth={2}
                  className="size-5"
                />
              </EmptyMedia>
              <EmptyTitle className="text-sm font-medium">
                Aucune Commande récente.
              </EmptyTitle>
              <EmptyDescription>
                Les nouvelles Commandes apparaîtront ici, avec leur statut et
                leur montant.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-hairline/60 hover:bg-transparent">
                <TableHead className="ps-(--card-spacing)">Commande</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead className="pe-(--card-spacing) text-end">
                  Montant
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {commandes.map((order) => (
                <TableRow
                  key={order.id}
                  className="relative border-hairline/60"
                >
                  <TableCell className="ps-(--card-spacing)">
                    <div className="flex flex-col">
                      <Link
                        href={`/admin/commandes/${order.id}`}
                        className="font-medium underline-offset-4 after:absolute after:inset-0 after:content-[''] [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
                      >
                        {shortOrderId(order.id)}
                      </Link>
                      <span className="text-xs text-muted-foreground">
                        {`${dateFormatter.format(order.createdAt)} — ${order.itemCount} article${order.itemCount > 1 ? "s" : ""}`}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <OrderStatusBadge status={order.status} />
                  </TableCell>
                  <TableCell className="pe-(--card-spacing) text-end font-medium tabular-nums">
                    {formatPrice(order.totalPayable)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {commandes.length > 0 ? (
        <CardFooter className="mbs-auto justify-end border-t border-hairline/60 py-3">
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/commandes" />}
          >
            {libelleDuPied(total)}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              data-icon="inline-end"
            />
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  )
}
