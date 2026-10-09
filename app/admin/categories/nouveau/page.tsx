import type { Metadata } from "next"

import { CategoryForm } from "@/components/admin/category-form"
import { lireOptionsSelecteur } from "@/lib/use-cases/lecture-structure"
import { createCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Nouvelle catégorie",
}

export default async function NewCategoryPage() {
  const candidates = await lireOptionsSelecteur()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nouvelle catégorie</h1>
      <CategoryForm categories={candidates} action={createCategoryAction} />
    </div>
  )
}
