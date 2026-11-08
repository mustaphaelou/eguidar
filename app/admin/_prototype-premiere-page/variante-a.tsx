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
 * PROTOTYPE (#963) — A, « L’invitation ».
 * La page entière cède la place à une seule invitation : les quatre indicateurs,
 * le graphique, sa période et les deux tableaux ne sont pas rendus.
 */
export function VarianteA() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tableau de bord"
        description="La boutique est en ligne ; son catalogue est vide."
      />

      <Empty className="min-h-[52svh] px-4 py-12 sm:px-6">
        <EmptyHeader className="max-w-md">
          <EmptyMedia variant="icon">
            <HugeiconsIcon
              icon={PackageAddIcon}
              strokeWidth={2}
              className="size-5"
            />
          </EmptyMedia>
          <EmptyTitle className="text-xl sm:text-2xl">
            Aucun produit au catalogue.
          </EmptyTitle>
          <EmptyDescription className="text-pretty">
            Un produit, une variante et son stock suffisent à la première
            commande. Les Commandes et le Chiffre d’affaires encaissé
            apparaîtront ici.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button size="lg" render={<Link href="/admin/produits/nouveau" />}>
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
    </div>
  )
}
