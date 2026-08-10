import { CategoryForm } from "@/components/admin/category-form"
import { listAdminCategoriesWithCounts } from "@/lib/use-cases/admin-structure"
import { createCategoryAction } from "@/app/admin/categories/actions"

export default async function NewCategoryPage() {
  const categories = await listAdminCategoriesWithCounts()

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Nouvelle catégorie</h1>
      <CategoryForm categories={categories} action={createCategoryAction} />
    </div>
  )
}
