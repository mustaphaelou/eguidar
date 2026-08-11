import Link from "next/link"
import type { Metadata } from "next"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatPrice } from "@/lib/money"
import { getDashboardStats, LOW_STOCK_THRESHOLD } from "@/lib/use-cases/admin-dashboard"

export const metadata: Metadata = {
  title: "Tableau de bord",
}

export default async function AdminDashboardPage() {
  const stats = await getDashboardStats()

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tableau de bord</h1>
        <Button render={<Link href="/admin/produits/nouveau" />}>Nouveau produit</Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Produits</p>
            <p className="text-3xl font-semibold">{stats.productCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Catégories</p>
            <p className="text-3xl font-semibold">{stats.categoryCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Commandes</p>
            <p className="text-3xl font-semibold">{stats.orderCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">En attente</p>
            <p className="text-3xl font-semibold">{stats.pendingOrderCount}</p>
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
            <p className="text-sm text-muted-foreground">Aucune variante en stock faible.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {stats.lowStockVariants.map((variant) => (
                <li key={variant.id} className="flex items-center justify-between gap-4 py-2">
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
                  <Badge variant={variant.stock === 0 ? "destructive" : "outline"}>
                    {variant.stock === 0 ? "Rupture" : `${variant.stock} restants`}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Activité récente — Produits</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun produit récent.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {stats.recentProducts.map((product) => (
                  <li key={product.id} className="flex items-center justify-between gap-4 py-2">
                    <Link
                      href={`/admin/produits/${product.id}`}
                      className="truncate font-medium hover:underline"
                    >
                      {product.name}
                    </Link>
                    <span className="text-sm text-muted-foreground">{formatPrice(product.price)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activité récente — Commandes</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucune commande récente.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {stats.recentOrders.map((order) => (
                  <li key={order.id} className="flex items-center justify-between gap-4 py-2">
                    <Link
                      href={`/admin/commandes/${order.id}`}
                      className="flex min-w-0 flex-col hover:underline"
                    >
                      <span className="truncate font-medium">
                        {order.id.slice(0, 8)} — {order.itemCount} article{order.itemCount > 1 ? "s" : ""}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("fr-FR")}
                      </span>
                    </Link>
                    <span className="text-sm text-muted-foreground">{formatPrice(order.total)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
