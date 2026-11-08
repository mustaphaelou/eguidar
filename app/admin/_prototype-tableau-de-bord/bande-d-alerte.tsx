import Link from "next/link"

import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Image01Icon,
  PackageIcon,
  PackageOutOfStockIcon,
  Robot01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { buildProduitListingUrl } from "@/lib/produit-listing"
import { cn } from "@/lib/utils"

import type { CompteursDAlerte } from "./donnees"

/**
 * PROTOTYPE (#964) — C garde deux cartes, mais la première devient une bande :
 * une ligne, les alertes vivantes en pastilles, et le calme en une phrase. Le
 * tableau du stock, lui, prend toute la largeur en dessous.
 */
export function BandeDAlerte({
  compteurs,
  className,
}: {
  compteurs: CompteursDAlerte
  className?: string
}) {
  const alertes = [
    {
      cle: "rupture",
      href: buildProduitListingUrl({ stock: "zero" }),
      label: "En rupture",
      count: compteurs.enRupture,
      icon: PackageOutOfStockIcon,
    },
    {
      cle: "stock",
      href: "#stock-faible",
      label: "Stock faible",
      count: compteurs.stockFaible,
      icon: PackageIcon,
    },
    {
      cle: "alt",
      href: "/admin/medias?sans-alt=1",
      label: "Sans texte alternatif",
      count: compteurs.sansAlt,
      icon: Image01Icon,
    },
    {
      cle: "echecs",
      href: "/admin/automatisations/executions?statut=echoue",
      label: "Automatisations en échec",
      count: compteurs.echecs,
      icon: Robot01Icon,
    },
  ].filter((alerte) => alerte.count > 0)

  return (
    <Card
      size="sm"
      className={cn(
        "flex-row flex-wrap items-center gap-3 px-(--card-spacing) py-3",
        className
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-lg border",
            alertes.length === 0
              ? "border-emerald-600/20 bg-emerald-500/10 text-emerald-700"
              : "border-amber-600/20 bg-amber-500/10 text-amber-700"
          )}
        >
          <HugeiconsIcon
            icon={alertes.length === 0 ? CheckmarkCircle02Icon : Alert02Icon}
            strokeWidth={2}
            className="size-4"
          />
        </span>
        À surveiller
      </span>

      {alertes.length === 0 ? (
        <span className="text-sm text-muted-foreground">Rien à signaler.</span>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {alertes.map((alerte) => (
            <Link
              key={alerte.cle}
              href={alerte.href}
              className="inline-flex items-center gap-1.5 rounded-full border bg-input/30 py-1 ps-2.5 pe-1 text-xs font-medium transition-colors hover:bg-input/50"
            >
              <HugeiconsIcon
                icon={alerte.icon}
                strokeWidth={2}
                className="size-3.5 text-muted-foreground"
              />
              {alerte.label}
              <Badge
                variant="outline"
                className="min-w-5 justify-center tabular-nums"
              >
                {alerte.count}
              </Badge>
            </Link>
          ))}
        </div>
      )}
    </Card>
  )
}
