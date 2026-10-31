import Link from "next/link"
import type { Metadata } from "next"
import { connection } from "next/server"

import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  ClockIcon,
  Image01Icon,
  PackageIcon,
  PackageOutOfStockIcon,
  Robot01Icon,
  ShoppingBasket02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { EmptyState } from "@/components/admin/empty-state"
import { RevenueChart } from "@/components/admin/revenue-chart"
import { PageHeader } from "@/components/layout/admin/page-header"
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
import { buildCommandeListingUrl } from "@/lib/commande-listing"
import { buildProduitListingUrl } from "@/lib/produit-listing"
import { formatPrice } from "@/lib/money"
import { compterExecutionsEnEchec } from "@/lib/automations/historique"
import { ORDER_STATUS_LABELS } from "@/lib/statut-de-commande"
import {
  getDashboardStats,
  LOW_STOCK_THRESHOLD,
} from "@/lib/use-cases/admin-dashboard"
import { listerImagesProduit } from "@/lib/use-cases/images-produit"
import { cn, shortOrderId } from "@/lib/utils"

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

type Ton = "neutre" | "attention" | "danger"

const TONS: Record<Ton, string> = {
  neutre: "border-border bg-muted/50 text-muted-foreground",
  attention: "border-amber-600/20 bg-amber-500/10 text-amber-700",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
}

function StatCard({
  label,
  value,
  hint,
  icon,
  href,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  icon: typeof Wallet01Icon
  href?: string
}) {
  return (
    <Card size="sm" className="h-full gap-3">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <CardAction className="hidden sm:block">
          <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tracking-tight break-normal tabular-nums sm:text-2xl">
          {href ? (
            <Link href={href} className="underline-offset-4 hover:underline">
              {value}
            </Link>
          ) : (
            value
          )}
        </p>
        <p className="mt-1 text-xs text-balance text-muted-foreground">
          {hint}
        </p>
      </CardContent>
    </Card>
  )
}

function LigneAlerte({
  href,
  label,
  hint,
  count,
  icon,
  ton,
}: {
  href: string
  label: string
  hint: string
  count: number
  icon: typeof Wallet01Icon
  ton: Ton
}) {
  return (
    <li className="relative">
      <div className="flex items-center gap-3 px-(--card-spacing) py-3 transition-colors hover:bg-muted/50">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            count > 0 ? TONS[ton] : TONS.neutre
          )}
        >
          <HugeiconsIcon icon={icon} strokeWidth={2} className="size-4" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="line-clamp-2 text-sm font-medium">{label}</span>
          <span className="truncate text-xs text-muted-foreground">{hint}</span>
        </span>
        <Badge
          render={
            <Link
              href={href}
              aria-label={`${label} (${count})`}
              className="after:absolute after:inset-0 after:content-['']"
            />
          }
          variant="outline"
          className={cn(
            "min-w-7 justify-center tabular-nums",
            count > 0 ? TONS[ton] : undefined
          )}
        >
          {count}
        </Badge>
      </div>
    </li>
  )
}

export default async function AdminDashboardPage() {
  await connection()
  const [stats, imagesSansAlt, executionsEnEchec] = await Promise.all([
    getDashboardStats(),
    listerImagesProduit({ sansAlt: true }),
    compterExecutionsEnEchec(),
  ])
  const revenueByMonth = stats.revenueByMonth.map((bucket) => ({
    month: frenchMonthLabel(bucket.month),
    revenue: bucket.revenue,
  }))
  const enAttenteUrl = buildCommandeListingUrl({ statuses: ["pending"] })
  const enRuptureUrl = buildProduitListingUrl({ stock: "zero" })
  const stockFaibleUrl = buildProduitListingUrl({ tri: "stock", sens: "asc" })
  const deltaPositif = (stats.caDelta ?? 0) > 0
  const deltaNul = stats.caDelta === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="Les chiffres de la boutique, les commandes à traiter et les points de vigilance."
        actions={
          <Button render={<Link href="/admin/produits/nouveau" />}>
            Nouveau produit
          </Button>
        }
      />

      <section
        aria-label="Indicateurs principaux"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <StatCard
          label="CA encaissé"
          value={formatPrice(stats.caEncaisse30j)}
          hint={
            stats.caDelta === undefined ? (
              <span className="flex items-center gap-1">
                Pas encore de comparaison
              </span>
            ) : (
              <span
                className={cn(
                  "flex items-center gap-1 font-medium",
                  deltaNul ? "text-muted-foreground" : undefined,
                  deltaPositif ? "text-emerald-700" : undefined,
                  !deltaPositif && !deltaNul ? "text-destructive" : undefined
                )}
              >
                {deltaNul ? null : (
                  <HugeiconsIcon
                    icon={
                      deltaPositif ? ArrowUpRight01Icon : ArrowDownRight01Icon
                    }
                    strokeWidth={2}
                    className="size-3.5"
                  />
                )}
                {deltaNul
                  ? "Stable vs 30 jours précédents"
                  : `${percentFormatter.format(Math.abs(stats.caDelta))} % vs 30 jours précédents`}
              </span>
            )
          }
          icon={Wallet01Icon}
        />
        <StatCard
          label="Commandes"
          value={stats.ordersLast30}
          hint="30 derniers jours"
          icon={ShoppingBasket02Icon}
          href="/admin/commandes"
        />
        <StatCard
          label="En attente"
          value={stats.pendingOrderCount}
          hint="Commandes à traiter"
          icon={ClockIcon}
          href={enAttenteUrl}
        />
        <StatCard
          label="Produits"
          value={stats.productCount}
          hint="Produits au catalogue"
          icon={PackageIcon}
          href="/admin/produits"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="h-full lg:col-span-4">
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

        <Card className="h-full lg:col-span-3">
          <CardHeader>
            <CardTitle>Commandes récentes</CardTitle>
            <CardAction>
              <Button
                variant="ghost"
                size="sm"
                render={<Link href="/admin/commandes" />}
              >
                Tout voir
              </Button>
            </CardAction>
          </CardHeader>
          <CardContent>
            {stats.recentOrders.length === 0 ? (
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
                className="border-0 bg-transparent px-2 py-8"
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {stats.recentOrders.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/admin/commandes/${order.id}`}
                      className="flex items-center justify-between gap-4 py-2.5 transition-colors hover:text-primary"
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

      <div className="grid items-start gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>À surveiller</CardTitle>
            <CardDescription>
              Les points qui demandent une action aujourd&apos;hui.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="flex flex-col divide-y border-t">
              <LigneAlerte
                href={enRuptureUrl}
                label="En rupture"
                hint="Stock total à zéro"
                count={stats.outOfStockCount}
                icon={PackageOutOfStockIcon}
                ton="danger"
              />
              <LigneAlerte
                href="#stock-faible"
                label="Stock faible"
                hint={`≤ ${LOW_STOCK_THRESHOLD} unités restantes`}
                count={stats.lowStockVariants.length}
                icon={PackageIcon}
                ton="attention"
              />
              <LigneAlerte
                href="/admin/medias?sans-alt=1"
                label="Images produit sans texte alternatif"
                hint="Dans la Bibliothèque des médias"
                count={imagesSansAlt.sansAltCount}
                icon={Image01Icon}
                ton="neutre"
              />
              <LigneAlerte
                href="/admin/automatisations/executions?statut=echoue"
                label="Automatisations en échec"
                hint="Exécutions à réessayer"
                count={executionsEnEchec}
                icon={Robot01Icon}
                ton="danger"
              />
            </ul>
          </CardContent>
        </Card>

        <Card id="stock-faible" className="h-full scroll-mt-20 lg:col-span-4">
          <CardHeader>
            <CardTitle>Stock faible (≤ {LOW_STOCK_THRESHOLD})</CardTitle>
            <CardDescription>
              Variantes dont le stock est épuisé ou proche de l&apos;épuisement.
            </CardDescription>
            {stats.lowStockVariants.length > 0 ? (
              <CardAction>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href={stockFaibleUrl} />}
                >
                  Voir les produits
                </Button>
              </CardAction>
            ) : null}
          </CardHeader>
          <CardContent>
            {stats.lowStockVariants.length === 0 ? (
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
                className="border-0 bg-transparent px-2 py-8"
              />
            ) : (
              <ul className="flex flex-col divide-y">
                {stats.lowStockVariants.map((variant) => (
                  <li
                    key={variant.id}
                    className="flex items-center justify-between gap-4 py-2.5"
                  >
                    <div className="flex min-w-0 flex-col">
                      <Link
                        href={`/admin/produits/${variant.productId}`}
                        className="truncate font-medium underline-offset-4 hover:underline"
                      >
                        {variant.productName}
                      </Link>
                      <span className="truncate text-sm text-muted-foreground">
                        {variant.name} — {variant.sku}
                      </span>
                    </div>
                    <Badge
                      variant={variant.stock === 0 ? "destructive" : "outline"}
                      className={cn(
                        "whitespace-nowrap tabular-nums",
                        variant.stock > 0 &&
                          "border-amber-600/20 bg-amber-500/10 text-amber-700"
                      )}
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
    </div>
  )
}
