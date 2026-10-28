import type { Metadata } from "next"

import { ProductForm } from "@/components/admin/product-form"
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
      <h1 className="text-2xl font-semibold">Nouveau produit</h1>
      <ProductForm
        structures={structures}
        bibliotheque={bibliotheque}
        action={createProductAction}
      />
    </div>
  )
}
