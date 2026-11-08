import Link from "next/link"

import {
  Image01Icon,
  PackageIcon,
  PackageOutOfStockIcon,
  Robot01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Badge } from "@/components/ui/badge"
import { buildProduitListingUrl } from "@/lib/produit-listing"
import { cn } from "@/lib/utils"

import type { CompteursDAlerte } from "./donnees"

type Ton = "neutre" | "attention" | "danger"

const TONS: Record<Ton, string> = {
  neutre: "border-border bg-muted/50 text-muted-foreground",
  attention: "border-amber-600/20 bg-amber-500/10 text-amber-700",
  danger: "border-destructive/20 bg-destructive/10 text-destructive",
}

const TON_DU_BADGE: Record<Ton, "outline" | "secondary" | "destructive"> = {
  neutre: "outline",
  attention: "outline",
  danger: "destructive",
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
  icon: React.ComponentProps<typeof HugeiconsIcon>["icon"]
  ton: Ton
}) {
  return (
    <li className="relative">
      <div className="flex items-center gap-3 px-(--card-spacing) py-3 transition-colors hover:bg-muted/40">
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg border",
            TONS[ton]
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
          variant={TON_DU_BADGE[ton]}
          className={cn(
            "min-w-7 justify-center tabular-nums",
            ton === "attention" ? TONS.attention : undefined
          )}
        >
          {count}
        </Badge>
      </div>
    </li>
  )
}

/**
 * PROTOTYPE (#964) — seules les alertes qui comptent existent. Une alerte à
 * zéro disparaît de la liste ; le calme complet se dit une fois, pas quatre.
 */
export function LignesDAlerte({
  compteurs,
  stockFaibleHref = "#stock-faible",
  masquerStockFaible = false,
}: {
  compteurs: CompteursDAlerte
  stockFaibleHref?: string
  masquerStockFaible?: boolean
}) {
  const lignes = [
    {
      cle: "rupture",
      href: buildProduitListingUrl({ stock: "zero" }),
      label: "En rupture",
      hint: "Stock total à zéro",
      count: compteurs.enRupture,
      icon: PackageOutOfStockIcon,
      ton: "danger" as const,
    },
    {
      cle: "stock",
      href: stockFaibleHref,
      label: "Stock faible",
      hint: "≤ 5 unités restantes",
      count: compteurs.stockFaible,
      icon: PackageIcon,
      ton: "attention" as const,
    },
    {
      cle: "alt",
      href: "/admin/medias?sans-alt=1",
      label: "Images produit sans texte alternatif",
      hint: "Dans la Bibliothèque des médias",
      count: compteurs.sansAlt,
      icon: Image01Icon,
      ton: "neutre" as const,
    },
    {
      cle: "echecs",
      href: "/admin/automatisations/executions?statut=echoue",
      label: "Automatisations en échec",
      hint: "Exécutions à réessayer",
      count: compteurs.echecs,
      icon: Robot01Icon,
      ton: "danger" as const,
    },
  ]

  const visibles = lignes.filter(
    (ligne) => ligne.count > 0 && !(masquerStockFaible && ligne.cle === "stock")
  )

  if (visibles.length === 0) return null

  return (
    <ul className="divide-y border-t">
      {visibles.map((ligne) => (
        <LigneAlerte
          key={ligne.cle}
          href={ligne.href}
          label={ligne.label}
          hint={ligne.hint}
          count={ligne.count}
          icon={ligne.icon}
          ton={ligne.ton}
        />
      ))}
    </ul>
  )
}
