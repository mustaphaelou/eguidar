"use server"

import { redirect } from "next/navigation"

import { NO_PARENT_VALUE } from "@/components/admin/category-form"
import {
  adminFormAction,
  INVALID_FORM_MESSAGE,
} from "@/lib/use-cases/mutation-actions"
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from "@/lib/use-cases/admin-structure"
import { realStructureEffects } from "@/lib/use-cases/structure-effects"

function parseCategoryFormData(formData: FormData): CategoryInput {
  const parentIdRaw = formData.get("parentId")
  const parentId =
    parentIdRaw && parentIdRaw !== NO_PARENT_VALUE ? String(parentIdRaw) : null
  const imageRaw = String(formData.get("image") ?? "").trim()
  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    parentId,
    image: imageRaw || null,
  }
}

interface CategoryUpdateInput extends CategoryInput {
  categoryId: string
}

interface CategoryDeleteInput {
  categoryId: string
  reassignToCategoryId?: string
}

export const createCategoryAction = adminFormAction<CategoryInput>({
  next: "/admin/categories",
  parse: parseCategoryFormData,
  run: async (input) => {
    await createCategory(input, realStructureEffects)
    redirect("/admin/categories")
  },
})

export const updateCategoryAction = adminFormAction<CategoryUpdateInput>({
  next: "/admin/categories",
  parse: (formData) => {
    const categoryId = String(formData.get("categoryId") ?? "")
    if (!categoryId) throw new Error(INVALID_FORM_MESSAGE)
    return { ...parseCategoryFormData(formData), categoryId }
  },
  run: async ({ categoryId, ...input }) => {
    await updateCategory(categoryId, input, realStructureEffects)
    redirect("/admin/categories")
  },
})

export const deleteCategoryAction = adminFormAction<CategoryDeleteInput>({
  next: "/admin/categories",
  parse: (formData) => {
    const categoryId = String(formData.get("categoryId") ?? "")
    if (!categoryId) throw new Error(INVALID_FORM_MESSAGE)
    const reassignRaw = formData.get("reassignToCategoryId")
    const reassignToCategoryId =
      reassignRaw && reassignRaw !== NO_PARENT_VALUE ? String(reassignRaw) : undefined
    return reassignToCategoryId ? { categoryId, reassignToCategoryId } : { categoryId }
  },
  run: async ({ categoryId, reassignToCategoryId }) => {
    await deleteCategory(
      categoryId,
      realStructureEffects,
      reassignToCategoryId ? { reassignToCategoryId } : {}
    )
    return {}
  },
})
