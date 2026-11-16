import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
  ClockIcon,
  PackageIcon,
  ShoppingBasket02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { CarteStat, VALEUR_MONETAIRE } from "@/components/admin/carte-stat"
import { buildCommandeListingUrl } from "@/lib/commande-listing"
import { formatPrice } from "@/lib/money"
import type { DashboardStats } from "@/lib/use-cases/admin-dashboard"
import { cn } from "@/lib/utils"

const percentFormatter = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 1,
})

function HintDuChiffreAffaires({ delta }: { delta: number | undefined }) {
  if (delta === undefined) {
    return (
      <span className="flex items-center gap-1">Pas encore de comparaison</span>
    )
  }

  const positif = delta > 0
  const nul = delta === 0

  return (
    <span
      className={cn(
        "flex items-center gap-1 font-medium",
        nul ? "text-muted-foreground" : undefined,
        positif ? "text-emerald-700" : undefined,
        !positif && !nul ? "text-destructive" : undefined
      )}
    >
      {nul ? null : (
        <HugeiconsIcon
          icon={positif ? ArrowUpRight01Icon : ArrowDownRight01Icon}
          strokeWidth={2}
          className="size-3.5"
        />
      )}
      {nul
        ? "Stable vs 30 jours précédents"
        : `${percentFormatter.format(Math.abs(delta))} % vs 30 jours précédents`}
    </span>
  )
}

export function CarteIndicateurs({ stats }: { stats: DashboardStats }) {
  const enAttenteUrl = buildCommandeListingUrl({ statuses: ["pending"] })

  return (
    <section
      aria-label="Indicateurs principaux"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <CarteStat
        label="Chiffre d'affaires net"
        value={formatPrice(stats.chiffreAffairesNet30j)}
        valueClassName={VALEUR_MONETAIRE}
        hint={
          <span className="flex flex-col gap-0.5">
            <span>Brut : {formatPrice(stats.chiffreAffairesBrut30j)}</span>
            <HintDuChiffreAffaires delta={stats.variationChiffreAffairesNet} />
          </span>
        }
        icon={Wallet01Icon}
      />
      <CarteStat
        label="Commandes"
        value={stats.ordersLast30}
        hint="30 derniers jours"
        icon={ShoppingBasket02Icon}
        href="/admin/commandes"
        action={`Commandes : ${stats.ordersLast30} — voir les commandes`}
      />
      <CarteStat
        label="En attente"
        value={stats.pendingOrderCount}
        hint="Commandes à traiter"
        icon={ClockIcon}
        href={enAttenteUrl}
        action={`Commandes en attente : ${stats.pendingOrderCount} — voir les commandes en attente`}
      />
      <CarteStat
        label="Produits"
        value={stats.productCount}
        hint="Produits au catalogue"
        icon={PackageIcon}
        href="/admin/produits"
        action={`Produits : ${stats.productCount} — voir les produits`}
      />
    </section>
  )
}
