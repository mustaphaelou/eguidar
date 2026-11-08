import Link from "next/link"

import {
  ArrowRight01Icon,
  ShoppingBasket02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { EmptyState } from "@/components/admin/empty-state"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { OrderStatusBadge } from "@/components/storefront/order-status-badge"
import { formatPrice } from "@/lib/money"
import type { RecentOrder } from "@/lib/use-cases/admin-dashboard"
import { cn, shortOrderId } from "@/lib/utils"

import { LigneDeListe } from "./ligne-de-liste"

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })

export type FormeDuPied = "passive" | "derniere-ligne" | "barre"

/**
 * PROTOTYPE (#964) — la liste des Commandes récentes, trois pieds.
 *
 * Les trois formes partagent la même liste et le même rythme de ligne que le
 * stock : 64 px, deux lignes, la valeur en haut à droite, le statut juste
 * dessous. Seul le geste final change — une ligne passive `Tout voir`, la même
 * ligne devenue le dernier élément de la liste, ou une barre d'action qui
 * nomme le nombre de Commandes.
 */
export function CarteCommandesRecentes({
  commandes,
  total,
  forme,
  className,
}: {
  commandes: RecentOrder[]
  total: number
  forme: FormeDuPied
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
            className="border-0 bg-transparent px-6 py-8"
          />
        ) : (
          <ul
            className={cn(
              "divide-y border-t",
              forme === "derniere-ligne" && "flex flex-1 flex-col"
            )}
          >
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
            {forme === "derniere-ligne" ? (
              <li className="mt-auto">
                <Link
                  href="/admin/commandes"
                  className="flex min-h-16 items-center justify-between gap-4 px-(--card-spacing) py-2.5 text-sm font-medium transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none"
                >
                  <span>Voir toutes les commandes</span>
                  <HugeiconsIcon
                    icon={ArrowRight01Icon}
                    strokeWidth={2}
                    className="size-4 text-muted-foreground"
                  />
                </Link>
              </li>
            ) : null}
          </ul>
        )}
        {forme === "passive" && commandes.length > 0 ? (
          <Link
            href="/admin/commandes"
            className="mt-auto flex min-h-11 items-center justify-between border-t px-(--card-spacing) py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
          >
            <span>Tout voir</span>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              strokeWidth={2}
              className="size-4"
            />
          </Link>
        ) : null}
        {forme === "barre" && commandes.length > 0 ? (
          <div className="mt-auto flex items-center justify-end border-t px-(--card-spacing) py-3">
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin/commandes" />}
            >
              Voir les {total} commandes
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                data-icon="inline-end"
              />
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
