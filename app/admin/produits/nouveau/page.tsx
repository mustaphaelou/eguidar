import type { Metadata } from "next"

import { ProductForm } from "@/components/admin/product-form"
import { listerImagesPourGalerie } from "@/lib/use-cases/images-produit"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import { createProductAction } from "@/app/admin/produits/actions"

export const metadata: Metadata = {
  title: "Nouveau produit",
}

export default async function NewProductPage() {
  const [categories, bibliotheque] = await Promise.all([
    lireStructure().then((lecture) => lecture.options()),
    listerImagesPourGalerie(),
  ])

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nouveau produit</h1>
      <ProductForm
        categories={categories}
        bibliotheque={bibliotheque}
        action={createProductAction}
      />
    </div>
  )
}
