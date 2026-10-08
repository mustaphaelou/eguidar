import type { Metadata } from "next"

import { ProductForm } from "@/components/admin/product-form"
import { lireOptionsSelecteur } from "@/lib/use-cases/lecture-structure"
import { createProductAction } from "@/app/admin/produits/actions"

export const metadata: Metadata = {
  title: "Nouveau produit",
}

export default async function NewProductPage() {
  const categories = await lireOptionsSelecteur()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nouveau produit</h1>
      <ProductForm categories={categories} action={createProductAction} />
    </div>
  )
}
