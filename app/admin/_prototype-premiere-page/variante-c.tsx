import Link from "next/link"

import {
  CheckmarkCircle02Icon,
  PackageAddIcon,
  ShoppingBasket02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { PageHeader } from "@/components/layout/admin/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * PROTOTYPE (#963) — C, « Les deux portes ».
 * Le Catalogue et les Commandes deviennent deux invitations de même poids ;
 * le graphique disparaît et les alertes se réduisent à une ligne.
 */
export function VarianteC() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="La boutique est en ligne ; son catalogue est vide."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="h-full">
          <CardHeader>
            <CardTitle>Catalogue</CardTitle>
            <CardDescription>
              Les produits que les clients peuvent acheter.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1">
            <Empty className="px-4 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon
                    icon={PackageAddIcon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </EmptyMedia>
                <EmptyTitle>Aucun produit au catalogue.</EmptyTitle>
                <EmptyDescription className="text-pretty">
                  Un produit, une variante et son stock suffisent à la première
                  commande.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button render={<Link href="/admin/produits/nouveau" />}>
                  Créer le premier produit
                </Button>
                <Link
                  href="/"
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Voir la boutique
                </Link>
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>

        <Card className="h-full">
          <CardHeader>
            <CardTitle>Commandes</CardTitle>
            <CardDescription>
              Les commandes passées depuis la boutique.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-1">
            <Empty className="px-4 py-8">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon
                    icon={ShoppingBasket02Icon}
                    strokeWidth={2}
                    className="size-5"
                  />
                </EmptyMedia>
                <EmptyTitle>Aucune commande pour le moment.</EmptyTitle>
                <EmptyDescription className="text-pretty">
                  Les Commandes arriveront ici dès qu’un client aura commandé.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border bg-muted/30 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon
            icon={CheckmarkCircle02Icon}
            strokeWidth={2}
            className="size-4 text-muted-foreground"
          />
          À surveiller
        </span>
        <span className="text-sm text-muted-foreground">Rien à signaler.</span>
      </div>
    </div>
  )
}
