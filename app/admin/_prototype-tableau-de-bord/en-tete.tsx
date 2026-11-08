import Link from "next/link"

import { PageHeader } from "@/components/layout/admin/page-header"
import { Button } from "@/components/ui/button"

export function EnTeteDuTableauDeBord() {
  return (
    <PageHeader
      title="Tableau de bord"
      description="Les chiffres de la boutique, les commandes à traiter et les points de vigilance."
      actions={
        <Button render={<Link href="/admin/produits/nouveau" />}>
          Nouveau produit
        </Button>
      }
    />
  )
}
