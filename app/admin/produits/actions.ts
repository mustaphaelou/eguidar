"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { ProductFormState } from "@/components/admin/product-form"
import { parseMadToCents } from "@/lib/money"
import {
  CatalogValidationError,
  createProduct,
  deleteProduct,
  DuplicateSkuError,
  SlugConflictError,
  updateProduct,
  updateVariantStock,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import { realCatalogEffects } from "@/lib/use-cases/catalog-effects"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"

const INVALID_FORM_MESSAGE = "Formulaire invalide"

class FormParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormParseError"
  }
}

function parseMoney(value: FormDataEntryValue | null): number {
  const cents = parseMadToCents(String(value ?? ""))
  if (cents === null) throw new FormParseError(INVALID_FORM_MESSAGE)
  return cents
}

function parseSpecsText(text: string): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(":")
    if (colon <= 0) throw new FormParseError("Format de spécifications invalide (clé : valeur par ligne)")
    specs[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim()
  }
  return specs
}

function parseProductFormData(formData: FormData): ProductInput {
  const imagesRaw = formData.get("images")
  const variantsRaw = formData.get("variants")

  let images: string[] = []
  let variants: ProductInput["variants"] = []
  try {
    images = JSON.parse(String(imagesRaw ?? "[]"))
    variants = JSON.parse(String(variantsRaw ?? "[]"))
  } catch {
    throw new FormParseError(INVALID_FORM_MESSAGE)
  }

  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: parseMoney(formData.get("price")),
    isFeatured: formData.get("isFeatured") === "on",
    featuredOrder: Number(formData.get("featuredOrder") ?? 0) || 0,
    freeShipping: formData.get("freeShipping") === "on",
    specs: parseSpecsText(String(formData.get("specsText") ?? "")),
    images,
    variants,
  }
}

function toActionError(error: unknown): ProductFormState {
  if (
    error instanceof FormParseError ||
    error instanceof CatalogValidationError ||
    error instanceof SlugConflictError ||
    error instanceof DuplicateSkuError
  ) {
    return { error: error.message }
  }
  throw error
}

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/produits")

  let input: ProductInput
  try {
    input = parseProductFormData(formData)
  } catch (error) {
    return toActionError(error)
  }

  try {
    const product = await createProduct(input, realCatalogEffects)
    revalidatePath("/admin/produits")
    redirect(`/admin/produits/${product.id}`)
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateProductAction(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/produits")

  const productId = String(formData.get("productId") ?? "")
  if (!productId) return { error: INVALID_FORM_MESSAGE }

  let input: ProductInput
  try {
    input = parseProductFormData(formData)
  } catch (error) {
    return toActionError(error)
  }

  try {
    await updateProduct(productId, input, realCatalogEffects)
    revalidatePath("/admin/produits")
    redirect("/admin/produits")
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteProductAction(formData: FormData): Promise<void> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/produits")

  const productId = String(formData.get("productId") ?? "")
  if (productId) {
    await deleteProduct(productId, realCatalogEffects)
  }
  revalidatePath("/admin/produits")
  redirect("/admin/produits")
}

export async function updateVariantStockAction(formData: FormData): Promise<void> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/produits")

  const variantId = String(formData.get("variantId") ?? "")
  const stock = Number(formData.get("stock") ?? 0)
  if (variantId) {
    const product = await updateVariantStock(variantId, stock, realCatalogEffects)
    revalidatePath(`/admin/produits/${product.id}`)
    revalidatePath("/admin/produits")
  }
}
