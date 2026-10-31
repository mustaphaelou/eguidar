import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/admin/page-header"
import { ProductForm } from "@/components/admin/product-form"
import { Button } from "@/components/ui/button"
import { listerImagesPourGalerie } from "@/lib/use-cases/images-produit"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import { createProductAction } from "@/app/admin/produits/actions"

export const metadata: Metadata = {
  title: "Nouveau produit",
}

export default async function NewProductPage() {
  const [lecture, bibliotheque] = await Promise.all([
    lireStructure(),
    listerImagesPourGalerie(),
  ])
  const structures = lecture.options().map((option) => ({
    id: option.id,
    nom: option.name,
    chemin: lecture
      .filAriane(option.id)
      .map((maillon) => maillon.name)
      .join(" › "),
  }))

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nouveau produit"
        description="Renseignez les informations, les images et les variantes du Produit."
        actions={
          <Button variant="outline" render={<Link href="/admin/produits" />}>
            Retour aux produits
          </Button>
        }
      />
      <ProductForm
        structures={structures}
        bibliotheque={bibliotheque}
        action={createProductAction}
      />
    </div>
  )
}
