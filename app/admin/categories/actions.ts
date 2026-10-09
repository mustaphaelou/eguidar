"use server"

import { redirect } from "next/navigation"

import {
  adminFormAction,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import {
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from "@/lib/use-cases/admin-structure"

function parseCategoryFormData(formData: FormData): CategoryInput {
  const parentId = String(formData.get("parentId") ?? "") || null
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
  reparentChildrenToCategoryId?: string
  orphanProducts?: boolean
}

export const createCategoryAction = adminFormAction<CategoryInput>({
  next: "/admin/categories",
  parse: parseCategoryFormData,
  run: async (input) => {
    await createCategory(input)
    redirect("/admin/categories")
  },
})

export const updateCategoryAction = adminFormAction<CategoryUpdateInput>({
  next: "/admin/categories",
  parse: (formData) => {
    return {
      ...parseCategoryFormData(formData),
      categoryId: parseRequiredId(formData, "categoryId"),
    }
  },
  run: async ({ categoryId, ...input }) => {
    await updateCategory(categoryId, input)
    redirect("/admin/categories")
  },
})

export const deleteCategoryAction = adminFormAction<CategoryDeleteInput>({
  next: "/admin/categories",
  parse: (formData) => {
    const categoryId = parseRequiredId(formData, "categoryId")
    const reassignToCategoryId = String(
      formData.get("reassignToCategoryId") ?? ""
    )
    const reparentChildrenToCategoryId = String(
      formData.get("reparentChildrenToCategoryId") ?? ""
    )
    const orphanProducts = formData.get("orphanProducts") === "on"
    return {
      categoryId,
      ...(reassignToCategoryId ? { reassignToCategoryId } : {}),
      ...(reparentChildrenToCategoryId ? { reparentChildrenToCategoryId } : {}),
      ...(orphanProducts ? { orphanProducts } : {}),
    }
  },
  run: async ({
    categoryId,
    reassignToCategoryId,
    reparentChildrenToCategoryId,
    orphanProducts,
  }) => {
    await deleteCategory(categoryId, {
      ...(reassignToCategoryId ? { reassignToCategoryId } : {}),
      ...(reparentChildrenToCategoryId ? { reparentChildrenToCategoryId } : {}),
      ...(orphanProducts ? { orphanProducts } : {}),
    })
    return {}
  },
})
