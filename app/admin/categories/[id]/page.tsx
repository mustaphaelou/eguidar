import { notFound } from "next/navigation"

import { CategoryForm } from "@/components/admin/category-form"
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
      <h1 className="text-2xl font-semibold">Modifier — {structure.name}</h1>
      <CategoryForm
        category={structure}
        categories={lecture.options()}
        excludedParentIds={lecture.branche(id)}
        action={updateCategoryAction}
      />
    </div>
  )
}
