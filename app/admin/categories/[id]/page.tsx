import { notFound } from "next/navigation"

import { CategoryForm } from "@/components/admin/category-form"
import { lireEcranEdition } from "@/lib/use-cases/lecture-structure"
import { updateCategoryAction } from "@/app/admin/categories/actions"

export default async function EditCategoryPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ecran = await lireEcranEdition(id)
  if (!ecran) notFound()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">
        Modifier — {ecran.structureEditee.name}
      </h1>
      <CategoryForm
        category={ecran.structureEditee}
        categories={ecran.candidates}
        excludedParentIds={ecran.parentesExclues}
        action={updateCategoryAction}
      />
    </div>
  )
}
