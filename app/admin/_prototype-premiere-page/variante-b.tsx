import Link from "next/link"

import {
  ClockIcon,
  PackageAddIcon,
  PackageIcon,
  ShoppingBasket02Icon,
  Wallet01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { RevenueChart } from "@/components/admin/revenue-chart"
import { PageHeader } from "@/components/layout/admin/page-header"
import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { formatPrice } from "@/lib/money"
import { cn } from "@/lib/utils"

import { hrefPeriode, PERIODES, type Periode } from "./periodes"

/**
 * PROTOTYPE (#963) — B, « La mise en route ».
 * Le chemin de trois étapes passe devant, mais les quatre indicateurs à zéro,
 * le graphique et sa période restent : c'est la version conservatrice.
 */

/** La taille des valeurs qui ne sont pas des montants. */
const VALEUR_DE_CARTE = "text-xl sm:text-2xl"

/** Le montant suit la largeur de sa carte (mesure de `page.tsx` sur `main`). */
const VALEUR_MONETAIRE =
  "text-[length:clamp(0.5rem,10.5cqi,1.5rem)] font-semibold tracking-tight break-normal whitespace-nowrap tabular-nums"

function CarteStat({
  label,
  value,
  hint,
  icon,
  valueClassName = VALEUR_DE_CARTE,
}: {
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  icon: typeof Wallet01Icon
  valueClassName?: string
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
      <CardContent className="@container">
        <p
          className={cn(
            "font-semibold tracking-tight break-normal tabular-nums",
            valueClassName
          )}
        >
          {value}
        </p>
        <p className="mt-1 text-xs text-balance text-muted-foreground">
          {hint}
        </p>
      </CardContent>
    </Card>
  )
}

const ETAPES = [
  {
    titre: "Créer un produit",
    detail: "Nom, prix, une variante et son stock.",
  },
  {
    titre: "Recevoir une commande",
    detail:
      "Une commande passée depuis la boutique arrive ici, au statut En attente.",
  },
  {
    titre: "Encaisser une vente",
    detail: "Une commande Livrée devient du Chiffre d’affaires encaissé.",
  },
] as const

const MOIS_VIDES = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
].map((month) => ({ month, revenue: 0 }))

export function VarianteB({ periode }: { periode: Periode }) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="La boutique est en ligne ; son catalogue est vide."
      />

      <Card>
        <CardHeader>
          <CardTitle>Mise en route</CardTitle>
          <CardDescription>
            Le premier produit ouvre la vente. Les deux étapes suivantes
            viendront des clients.
          </CardDescription>
          <CardAction>
            <Badge variant="outline" className="tabular-nums">
              0 sur 3
            </Badge>
          </CardAction>
        </CardHeader>
        <CardContent>
          <ol className="grid gap-3 lg:grid-cols-3">
            {ETAPES.map((etape, index) => {
              const active = index === 0
              return (
                <li
                  key={etape.titre}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex flex-col gap-3 rounded-xl border p-4",
                    active ? "bg-muted/30" : "bg-transparent"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "border text-muted-foreground"
                      )}
                    >
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium">{etape.titre}</span>
                  </div>
                  <p className="text-sm text-pretty text-muted-foreground">
                    {etape.detail}
                  </p>
                  {active ? (
                    <Button
                      className="mt-auto self-start"
                      render={<Link href="/admin/produits/nouveau" />}
                    >
                      <HugeiconsIcon
                        icon={PackageAddIcon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      Créer le premier produit
                    </Button>
                  ) : (
                    <span className="mt-auto text-xs text-muted-foreground">
                      En attente
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </CardContent>
      </Card>

      <section
        aria-label="Indicateurs principaux"
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
      >
        <CarteStat
          label="CA encaissé"
          value={formatPrice(0)}
          valueClassName={VALEUR_MONETAIRE}
          hint="Pas encore de comparaison"
          icon={Wallet01Icon}
        />
        <CarteStat
          label="Commandes"
          value={0}
          hint="30 derniers jours"
          icon={ShoppingBasket02Icon}
        />
        <CarteStat
          label="En attente"
          value={0}
          hint="Commandes à traiter"
          icon={ClockIcon}
        />
        <CarteStat
          label="Produits"
          value={0}
          hint="Produits au catalogue"
          icon={PackageIcon}
        />
      </section>

      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex min-w-0 flex-col gap-2">
              <CardTitle>Chiffre d’affaires encaissé</CardTitle>
              <CardDescription>
                Commandes livrées, frais de livraison inclus.
              </CardDescription>
            </div>
            <div
              role="group"
              aria-label="Période"
              className="flex items-center gap-1"
            >
              {PERIODES.map((choix) => {
                const active = choix.cle === periode
                return (
                  <Link
                    key={choix.cle}
                    href={hrefPeriode(choix.cle, "B")}
                    scroll={false}
                    aria-current={active ? "page" : undefined}
                    className={buttonVariants({
                      variant: active ? "outline" : "ghost",
                      size: "sm",
                    })}
                  >
                    {choix.libelle}
                  </Link>
                )
              })}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <RevenueChart data={MOIS_VIDES} />
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Aucune Commande et aucun stock à surveiller pour l’instant.
      </p>
    </div>
  )
}
