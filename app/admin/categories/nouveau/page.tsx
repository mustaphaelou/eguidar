import type { Metadata } from "next"
import Link from "next/link"

import { PageHeader } from "@/components/layout/admin/page-header"
import { CategoryForm } from "@/components/admin/category-form"
import { Button } from "@/components/ui/button"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import { createCategoryAction } from "@/app/admin/categories/actions"

export const metadata: Metadata = {
  title: "Nouvelle catégorie",
}

export default async function NewCategoryPage() {
  const candidates = (await lireStructure()).options()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Nouvelle catégorie"
        description="Une Structure range les Produits et peut contenir des sous-catégories."
        actions={
          <Button variant="outline" render={<Link href="/admin/categories" />}>
            Retour aux catégories
          </Button>
        }
      />
      <CategoryForm categories={candidates} action={createCategoryAction} />
    </div>
  )
}
