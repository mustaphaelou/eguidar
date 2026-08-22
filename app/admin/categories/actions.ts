"use server"

import { redirect } from "next/navigation"

import type { CategoryFormState } from "@/components/admin/category-form"
import { NO_PARENT_VALUE } from "@/components/admin/category-form"
import { loginUrl } from "@/lib/lien-de-connexion"
import {
  CategoryHasChildrenError,
  CategoryHasProductsError,
  CategoryNotFoundError,
  CategorySlugConflictError,
  CategoryValidationError,
  createCategory,
  deleteCategory,
  updateCategory,
  type CategoryInput,
} from "@/lib/use-cases/admin-structure"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"
import { realStructureEffects } from "@/lib/use-cases/structure-effects"

const INVALID_FORM_MESSAGE = "Formulaire invalide"

class FormParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormParseError"
  }
}

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

function toActionError(error: unknown): CategoryFormState {
  if (
    error instanceof FormParseError ||
    error instanceof CategoryValidationError ||
    error instanceof CategorySlugConflictError ||
    error instanceof CategoryNotFoundError ||
    error instanceof CategoryHasChildrenError ||
    error instanceof CategoryHasProductsError
  ) {
    return { error: error.message }
  }
  throw error
}

export async function createCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const session = await getAdminSession()
  if (!session) redirect(loginUrl("/admin/categories"))

  let input: CategoryInput
  try {
    input = parseCategoryFormData(formData)
  } catch (error) {
    return toActionError(error)
  }

  try {
    await createCategory(input, realStructureEffects)
    redirect("/admin/categories")
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const session = await getAdminSession()
  if (!session) redirect(loginUrl("/admin/categories"))

  const categoryId = String(formData.get("categoryId") ?? "")
  if (!categoryId) return { error: INVALID_FORM_MESSAGE }

  let input: CategoryInput
  try {
    input = parseCategoryFormData(formData)
  } catch (error) {
    return toActionError(error)
  }

  try {
    await updateCategory(categoryId, input, realStructureEffects)
    redirect("/admin/categories")
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteCategoryAction(
  _prevState: CategoryFormState,
  formData: FormData
): Promise<CategoryFormState> {
  const session = await getAdminSession()
  if (!session) redirect(loginUrl("/admin/categories"))

  const categoryId = String(formData.get("categoryId") ?? "")
  if (!categoryId) return { error: INVALID_FORM_MESSAGE }

  const reassignRaw = formData.get("reassignToCategoryId")
  const reassignToCategoryId =
    reassignRaw && reassignRaw !== NO_PARENT_VALUE ? String(reassignRaw) : undefined

  try {
    await deleteCategory(
      categoryId,
      realStructureEffects,
      reassignToCategoryId ? { reassignToCategoryId } : {}
    )
  } catch (error) {
    return toActionError(error)
  }

  return {}
}
