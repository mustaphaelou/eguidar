"use server"

import { redirect } from "next/navigation"

import {
  adminFormAction,
  adminTaskAction,
  INVALID_FORM_MESSAGE,
  parseMoneyField,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import {
  createProduct,
  deleteProduct,
  updateProduct,
  updateVariantStock,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"
import { realCatalogEffects } from "@/lib/use-cases/catalog-effects"

function parseSpecsText(text: string): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(":")
    if (colon <= 0) throw new Error("Format de spécifications invalide (clé : valeur par ligne)")
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
    throw new Error(INVALID_FORM_MESSAGE)
  }

  return {
    name: String(formData.get("name") ?? ""),
    slug: String(formData.get("slug") ?? ""),
    brand: String(formData.get("brand") ?? ""),
    categoryId: String(formData.get("categoryId") ?? ""),
    description: String(formData.get("description") ?? ""),
    price: parseMoneyField(formData, "price"),
    isFeatured: formData.get("isFeatured") === "on",
    featuredOrder: Number(formData.get("featuredOrder") ?? 0) || 0,
    freeShipping: formData.get("freeShipping") === "on",
    specs: parseSpecsText(String(formData.get("specsText") ?? "")),
    images,
    variants,
  }
}

interface ProductUpdateInput extends ProductInput {
  productId: string
}

export const createProductAction = adminFormAction<ProductInput>({
  next: "/admin/produits",
  parse: parseProductFormData,
  run: async (input) => {
    const product = await createProduct(input, realCatalogEffects)
    redirect(`/admin/produits/${product.id}`)
  },
})

export const updateProductAction = adminFormAction<ProductUpdateInput>({
  next: "/admin/produits",
  parse: (formData) => {
    return { ...parseProductFormData(formData), productId: parseRequiredId(formData, "productId") }
  },
  run: async ({ productId, ...input }) => {
    await updateProduct(productId, input, realCatalogEffects)
    redirect("/admin/produits")
  },
})

export const deleteProductAction = adminTaskAction<{ productId: string }>({
  next: "/admin/produits",
  parse: (formData) => ({ productId: parseRequiredId(formData, "productId") }),
  run: async ({ productId }) => {
    await deleteProduct(productId, realCatalogEffects)
    redirect("/admin/produits")
  },
})

export const updateVariantStockAction = adminTaskAction<{
  variantId: string
  stock: number
}>({
  next: "/admin/produits",
  parse: (formData) => ({
    variantId: parseRequiredId(formData, "variantId"),
    stock: Number(formData.get("stock") ?? 0),
  }),
  run: async ({ variantId, stock }) => {
    await updateVariantStock(variantId, stock, realCatalogEffects)
  },
})
