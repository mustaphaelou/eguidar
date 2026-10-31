import Link from "next/link"
import { notFound } from "next/navigation"

import { PageHeader } from "@/components/layout/admin/page-header"
import { CategoryForm } from "@/components/admin/category-form"
import { Button } from "@/components/ui/button"
import { lireStructure } from "@/lib/use-cases/lecture-structure"
import { updateCategoryAction } from "@/app/admin/categories/actions"

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const lecture = await lireStructure()
  const structure = lecture.structure(id)
  if (!structure) notFound()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={`Modifier — ${structure.name}`}
        description="Le nom, le slug, la Structure parente et l’image de la catégorie."
        actions={
          <Button variant="outline" render={<Link href="/admin/categories" />}>
            Retour aux catégories
          </Button>
        }
      />
      <CategoryForm
        category={structure}
        categories={lecture.options()}
        excludedParentIds={lecture.branche(id)}
        action={updateCategoryAction}
      />
    </div>
  )
}
