import { notFound } from "next/navigation"

import { CategoryForm, type CategoryFormInitial } from "@/components/admin/category-form"
import { listAdminCategoriesWithCounts } from "@/lib/use-cases/admin-structure"
import { updateCategoryAction } from "@/app/admin/categories/actions"

function collectDescendantIds(
  categories: Awaited<ReturnType<typeof listAdminCategoriesWithCounts>>,
  rootId: string
): string[] {
  const childrenByParent = new Map<string, string[]>()
  for (const category of categories) {
    if (category.parentId) {
      const siblings = childrenByParent.get(category.parentId) ?? []
      siblings.push(category.id)
      childrenByParent.set(category.parentId, siblings)
    }
  }
  const descendants: string[] = []
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()!
    const children = childrenByParent.get(id) ?? []
    descendants.push(...children)
    stack.push(...children)
  }
  return descendants
}

export default async function EditCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const categories = await listAdminCategoriesWithCounts()
  const category = categories.find((candidate) => candidate.id === id)
  if (!category) notFound()

  const initial: CategoryFormInitial = {
    id: category.id,
    name: category.name,
    slug: category.slug,
    parentId: category.parentId,
    image: category.image,
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Modifier — {category.name}</h1>
      <CategoryForm
        category={initial}
        categories={categories}
        excludedParentIds={[category.id, ...collectDescendantIds(categories, category.id)]}
        action={updateCategoryAction}
      />
    </div>
  )
}
