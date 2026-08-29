import Link from "next/link"
import type { Metadata } from "next"
import { connection } from "next/server"

import {
  ClockIcon,
  PackageIcon,
  ShoppingBasket02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { RevenueChart } from "@/components/admin/revenue-chart"
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
import { formatPrice } from "@/lib/money"
import { ORDER_STATUS_LABELS } from "@/lib/order-status"
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"
import { shortOrderId } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Tableau de bord",
}

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" })
const percentFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" })

function frenchMonthLabel(key: string): string {
  const [year, month] = key.split("-")
  return monthFormatter.format(new Date(Number(year), Number(month) - 1, 1))
}

export default async function AdminDashboardPage() {
  await connection()
  const stats = await getDashboardStats()
  const revenueByMonth = stats.revenueByMonth.map((bucket) => ({
    month: frenchMonthLabel(bucket.month),
    revenue: bucket.revenue,
  }))

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <Button render={<Link href="/admin/produits/nouveau" />}>
          Nouveau produit
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium">CA encaissé</CardTitle>
            <CardAction>
              <HugeiconsIcon
                icon={Wallet01Icon}
                strokeWidth={2}
                className="size-5 text-muted-foreground"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatPrice(stats.caEncaisse30j)}
            </p>
            <p className="text-xs text-muted-foreground">
              {stats.caDelta === undefined
                ? "—"
                : `${percentFormatter.format(stats.caDelta)} % vs 30 jours précédents`}
            </p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Commandes</CardTitle>
            <CardAction>
              <HugeiconsIcon
                icon={ShoppingBasket02Icon}
                strokeWidth={2}
                className="size-5 text-muted-foreground"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{stats.ordersLast30}</p>
            <p className="text-xs text-muted-foreground">30 derniers jours</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium">En attente</CardTitle>
            <CardAction>
              <HugeiconsIcon
                icon={ClockIcon}
                strokeWidth={2}
                className="size-5 text-muted-foreground"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              <Link
                href="/admin/commandes?statut=pending"
                className="hover:underline"
              >
                {stats.pendingOrderCount}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">Commandes à traiter</p>
          </CardContent>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Stock faible</CardTitle>
            <CardAction>
              <HugeiconsIcon
                icon={PackageIcon}
                strokeWidth={2}
                className="size-5 text-muted-foreground"
              />
            </CardAction>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              <Link href="/admin/produits" className="hover:underline">
                {stats.lowStockVariants.length}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              ≤ {LOW_STOCK_THRESHOLD} unités
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader>
            <CardTitle>CA encaissé — 12 derniers mois</CardTitle>
            <CardDescription>
              Commandes livrées, frais de livraison inclus.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RevenueChart data={revenueByMonth} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Commandes récentes</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune commande récente.
              </p>
            ) : (
              <ul className="flex flex-col divide-y">
                {stats.recentOrders.map((order) => (
                  <li key={order.id} className="py-2">
                    <Link
                      href={`/admin/commandes/${order.id}`}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {shortOrderId(order.id)} — {order.itemCount} article
                          {order.itemCount > 1 ? "s" : ""}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {dateFormatter.format(order.createdAt)} —{" "}
                          {ORDER_STATUS_LABELS[order.status]}
                        </span>
                      </span>
                      <span className="text-sm font-medium whitespace-nowrap">
                        {formatPrice(order.totalPayable)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stock faible (≤ {LOW_STOCK_THRESHOLD})</CardTitle>
          <CardDescription>
            Variantes dont le stock est épuisé ou proche de l&apos;épuisement.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.lowStockVariants.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune variante en stock faible.
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {stats.lowStockVariants.map((variant) => (
                <li
                  key={variant.id}
                  className="flex items-center justify-between gap-4 py-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <Link
                      href={`/admin/produits/${variant.productId}`}
                      className="truncate font-medium hover:underline"
                    >
                      {variant.productName}
                    </Link>
                    <span className="text-sm text-muted-foreground">
                      {variant.name} — {variant.sku}
                    </span>
                  </div>
                  <Badge
                    variant={variant.stock === 0 ? "destructive" : "outline"}
                  >
                    {variant.stock === 0
                      ? "Rupture"
                      : `${variant.stock} restants`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
