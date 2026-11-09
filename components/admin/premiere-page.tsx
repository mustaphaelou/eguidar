import Link from "next/link"

import { PackageAddIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { PageHeader } from "@/components/layout/admin/page-header"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

/**
 * La première page : un catalogue et un carnet vides. Aucun indicateur, aucun
 * graphique, aucune période, aucune liste — une invitation, un geste.
 */
export function PremierePage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="La boutique est en ligne ; son catalogue est vide."
      />

      <Empty size="page">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon
              icon={PackageAddIcon}
              strokeWidth={2}
              className="size-5"
            />
          </EmptyMedia>
          <EmptyTitle>Aucun Produit au catalogue.</EmptyTitle>
          <EmptyDescription>
            Un Produit, une Variante et son stock suffisent à la première
            Commande. Les Commandes et le Chiffre d&apos;affaires encaissé
            apparaîtront ici.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="lg" render={<Link href="/admin/produits/nouveau" />}>
            Créer le premier produit
          </Button>
          <Link
            href="/"
            className="text-sm text-muted-foreground underline-offset-4 [@media(hover:hover)_and_(pointer:fine)]:hover:text-foreground [@media(hover:hover)_and_(pointer:fine)]:hover:underline"
          >
            Voir la boutique
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  )
}
