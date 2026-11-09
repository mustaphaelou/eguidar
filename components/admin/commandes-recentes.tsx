import Link from "next/link"

import {
  ArrowRight01Icon,
  ShoppingBasket02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { EmptyState } from "@/components/admin/empty-state"
import { LigneDeListe } from "@/components/admin/ligne-de-liste"
import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatPrice } from "@/lib/money"
import type { RecentOrder } from "@/lib/use-cases/admin-dashboard"
import { cn, shortOrderId } from "@/lib/utils"

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

function libelleDuPied(total: number): string {
  return total > 1 ? `Voir les ${total} commandes` : "Voir la commande"
}

/**
 * Les cinq dernières Commandes, au rythme commun des listes. Le pied nomme le
 * total des Commandes et reste ancré au bas de la carte (`mt-auto`) : à deux
 * Commandes, l'air sous la liste est borné, pas perdu.
 */
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
    <Card className={cn("flex h-full flex-col", className)}>
      <CardHeader>
        <CardTitle>Commandes récentes</CardTitle>
        <CardDescription>Les dernières commandes reçues.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col px-0">
        {commandes.length === 0 ? (
          <EmptyState
            icon={
              <HugeiconsIcon
                icon={ShoppingBasket02Icon}
                strokeWidth={2}
                className="size-5"
              />
            }
            title="Aucune commande récente."
            description="Les nouvelles commandes apparaîtront ici, avec leur statut et leur montant."
            className="border-0 bg-transparent px-(--card-spacing) py-8"
          />
        ) : (
          <>
            <ul className="divide-y border-t">
              {commandes.map((order) => (
                <LigneDeListe
                  key={order.id}
                  href={`/admin/commandes/${order.id}`}
                  titre={shortOrderId(order.id)}
                  sousTitre={`${dateFormatter.format(order.createdAt)} — ${order.itemCount} article${order.itemCount > 1 ? "s" : ""}`}
                  trailing={
                    <span className="flex flex-col items-end gap-0.5">
                      <span className="text-sm font-medium whitespace-nowrap tabular-nums">
                        {formatPrice(order.totalPayable)}
                      </span>
                      <OrderStatusBadge status={order.status} />
                    </span>
                  }
                />
              ))}
            </ul>
            <div className="mt-auto flex items-center justify-end border-t px-(--card-spacing) py-3">
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
