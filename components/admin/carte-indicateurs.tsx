import {
  ArrowDownRight01Icon,
  ArrowUpRight01Icon,
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
      className="flex flex-col gap-3"
    >
      <CarteStat
        variant="hero"
        label="Chiffre d'affaires net"
        value={formatPrice(stats.chiffreAffairesNet30j)}
        valueClassName={VALEUR_MONETAIRE}
        hint={
          <span className="flex flex-col gap-0.5">
            <span>Brut : {formatPrice(stats.chiffreAffairesBrut30j)}</span>
            <HintDuChiffreAffaires delta={stats.variationChiffreAffairesNet} />
          </span>
        }
        legende="30 derniers jours"
        icon={Wallet01Icon}
      />
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 rounded-2xl bg-muted/40 px-4 py-3 ring-1 ring-foreground/10">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Commandes
          </span>
          <CarteStat
            variant="chiffre"
            label="Commandes"
            value={stats.ordersLast30}
            href="/admin/commandes"
            action={`Commandes : ${stats.ordersLast30} — voir les commandes`}
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            En attente
          </span>
          <CarteStat
            variant="chiffre"
            label="En attente"
            value={stats.pendingOrderCount}
            href={enAttenteUrl}
            action={`Commandes en attente : ${stats.pendingOrderCount} — voir les commandes en attente`}
          />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Produits
          </span>
          <CarteStat
            variant="chiffre"
            label="Produits"
            value={stats.productCount}
            href="/admin/produits"
            action={`Produits : ${stats.productCount} — voir les produits`}
          />
        </div>
      </div>
    </section>
  )
}
