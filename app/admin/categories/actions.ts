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

/**
 * Une Structure racine est une Structure dont le formulaire n'envoie pas le
 * champ : l'absence du champ est l'absence de parente, et il n'y a rien à lui
 * comparer. Une sentinelle, elle, devait être reconnue à raison près des deux
 * côtés d'une frontière asynchrone — et ce module étant `"use server"`, la
 * constante importée d'un module `"use client"` y était remplacée par un
 * mandataire : la comparaison était fausse pour la seule valeur qui comptait,
 * et le refus que l'Administration rendait ne disait rien de sa cause. Une
 * valeur qu'il faut comparer correctement des deux côtés sera comparée de
 * travers à nouveau ; l'absence, elle, n'a rien à représenter.
 */
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
    // Comme la parente : pas de cible choisie, pas de champ — donc rien à
    // reconnaître, et une Structure qui a des Produits est refusée telle quelle.
    const reassignToCategoryId = String(
      formData.get("reassignToCategoryId") ?? ""
    )
    return reassignToCategoryId
      ? { categoryId, reassignToCategoryId }
      : { categoryId }
  },
  run: async ({ categoryId, reassignToCategoryId }) => {
    await deleteCategory(
      categoryId,
      reassignToCategoryId ? { reassignToCategoryId } : {}
    )
    return {}
  },
})
