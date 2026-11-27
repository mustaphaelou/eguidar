import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  Clock01Icon,
  PackageIcon,
  ShoppingBasket02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CarteStat, VALEUR_MONETAIRE } from "@/components/admin/carte-stat"
import { Badge } from "@/components/ui/badge"
import { buildCommandeListingUrl } from "@/lib/commande-listing"
import { formatPrice } from "@/lib/money"
import type { DashboardStats } from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})

function BadgeDeVariation({ delta }: { delta: number | undefined }) {
  if (delta === undefined) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Pas encore de comparaison
      </Badge>
    )
  }

  const positif = delta > 0
  const nul = delta === 0

  return (
    <Badge
      variant={positif || nul ? "secondary" : "destructive"}
      className={cn(
        "tabular-nums",
        positif && "bg-succes-fond text-succes",
        nul && "text-muted-foreground"
      )}
    >
      {nul ? null : (
        <HugeiconsIcon
          icon={positif ? ArrowUpRight01Icon : ArrowDownRight01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
      )}
      {nul
        ? "0 %"
        : `${positif ? "+" : "-"}${percentFormatter.format(Math.abs(delta))} %`}
    </Badge>
  )
}

export function CarteIndicateurs({ stats }: { stats: DashboardStats }) {
  const enAttenteUrl = buildCommandeListingUrl({ statuses: ["pending"] })

  return (
    <section
      aria-label="Indicateurs principaux"
      className="flex flex-col gap-4"
    >
      <CarteStat
        variant="hero"
        label="Chiffre d'affaires net"
        value={formatPrice(stats.chiffreAffairesNet30j)}
        valueClassName={VALEUR_MONETAIRE}
        badge={<BadgeDeVariation delta={stats.variationChiffreAffairesNet} />}
        hint={`Brut : ${formatPrice(stats.chiffreAffairesBrut30j)}`}
        legende="30 derniers jours"
        icon={Wallet01Icon}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <CarteStat
          label="Commandes"
          value={stats.ordersLast30}
          hint="Reçues sur les 30 derniers jours"
          icon={ShoppingBasket02Icon}
          href="/admin/commandes"
          action={`Commandes : ${stats.ordersLast30} — voir les commandes`}
        />

        <CarteStat
          label="En attente"
          value={stats.pendingOrderCount}
          hint="Commandes à traiter"
          icon={Clock01Icon}
          href={enAttenteUrl}
          action={`Commandes en attente : ${stats.pendingOrderCount} — voir les commandes en attente`}
        />

        <CarteStat
          label="Produits"
          value={stats.productCount}
          hint={
            stats.surveillance.enRupture > 0
              ? `${stats.surveillance.enRupture} en rupture de stock`
              : "Catalogue actif"
          }
          icon={PackageIcon}
          href="/admin/produits"
          action={`Produits : ${stats.productCount} — voir les produits`}
        />
      </div>
    </section>
  )
}
