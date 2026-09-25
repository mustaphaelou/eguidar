"use server"

import { randomUUID } from "node:crypto"

import { redirect } from "next/navigation"

import cycleVieImageProduit, {
  type ImageProduitPromue,
} from "@/lib/cycle-vie-image-produit"
import {
  galerieImageProduitSchema,
  type EntreeImageProduit,
} from "@/lib/galerie-image-produit"
import {
  adminFormAction,
  adminTaskAction,
  INVALID_FORM_MESSAGE,
  parseMoneyField,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"
import {
  assertPersistedImagesAreOwned,
  createProduct,
  deleteProduct,
  getAdminProduct,
  ProductNotFoundError,
  updateProduct,
  updateVariantStock,
  type ProductInput,
} from "@/lib/use-cases/admin-catalog"

function parseSpecsText(text: string): Record<string, string> {
  const specs: Record<string, string> = {}
  for (const line of text.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const colon = trimmed.indexOf(":")
    if (colon <= 0)
      throw new Error(
        "Format de spécifications invalide (clé : valeur par ligne)"
      )
    specs[trimmed.slice(0, colon).trim()] = trimmed.slice(colon + 1).trim()
  }
  return specs
}

interface ProductFormInput extends Omit<ProductInput, "images"> {
  images: EntreeImageProduit[]
  tentativeId: string
}

function parseProductFormData(formData: FormData): ProductFormInput {
  const imagesRaw = formData.get("images")
  const variantsRaw = formData.get("variants")
  const tentativeRaw = formData.get("tentativeId")

  let images: EntreeImageProduit[]
  let variants: ProductInput["variants"]
  try {
    images = galerieImageProduitSchema.parse(
      JSON.parse(String(imagesRaw ?? "[]"))
    )
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
    tentativeId:
      typeof tentativeRaw === "string" && tentativeRaw.trim()
        ? tentativeRaw.trim()
        : randomUUID(),
  }
}

function champsCatalogue(
  input: ProductFormInput
): Omit<ProductInput, "images"> {
  const { images: _images, tentativeId: _tentativeId, ...champs } = input
  return champs
}

function refuserImagesPersisteesEnCreation(
  images: readonly EntreeImageProduit[]
): void {
  if (images.some((image) => image.kind === "persistee")) {
    throw new UserFacingError(
      "Une création de Produit ne peut contenir que des Brouillons d'Image produit"
    )
  }
}

function urlsPersistees(images: readonly EntreeImageProduit[]): string[] {
  return images.flatMap((image) =>
    image.kind === "persistee" ? [image.url] : []
  )
}

function urlsGalerieMiseAJour(
  images: readonly EntreeImageProduit[],
  promoted: readonly ImageProduitPromue[]
): string[] {
  const promotedParDraftId = new Map(
    promoted.map((image) => [image.draftId, image.publicUrl])
  )
  return images.map((image) => {
    if (image.kind === "persistee") return image.url
    const publicUrl = promotedParDraftId.get(image.draftId)
    if (publicUrl === undefined) {
      throw new Error("URL d'Image produit promue indisponible")
    }
    return publicUrl
  })
}

interface ProductUpdateInput extends ProductFormInput {
  productId: string
}

export const createProductAction = adminFormAction<ProductFormInput>({
  next: "/admin/produits",
  parse: parseProductFormData,
  run: async (input, client) => {
    refuserImagesPersisteesEnCreation(input.images)
    const champs = champsCatalogue(input)
    const draftIds = input.images.flatMap((image) =>
      image.kind === "brouillon" ? [image.draftId] : []
    )

    if (draftIds.length === 0) {
      const product = await createProduct({ ...champs, images: [] })
      redirect(`/admin/produits/${product.id}`)
    }

    const resultat = await cycleVieImageProduit.revendiquerEtEnregistrer({
      tentativeId: input.tentativeId,
      ownerId: client.id,
      draftIds,
      resultatDejaPersiste: async (productId) => {
        const product = await getAdminProduct(productId)
        if (!product) throw new Error("Produit enregistré introuvable")
        return product
      },
      enregistrer: async (images, lier) => {
        const product = await createProduct(
          { ...champs, images: images.map((image) => image.publicUrl) },
          undefined,
          {
            lier,
            promues: images.map((image) => image.publicUrl),
          }
        )
        return { productId: product.id, result: product }
      },
    })
    if (!resultat.ok) throw new UserFacingError(resultat.message)

    redirect(`/admin/produits/${resultat.productId}`)
  },
})

export const updateProductAction = adminFormAction<ProductUpdateInput>({
  next: "/admin/produits",
  parse: (formData) => {
    return {
      ...parseProductFormData(formData),
      productId: parseRequiredId(formData, "productId"),
    }
  },
  run: async ({ productId, images, tentativeId, ...input }, client) => {
    const existing = await getAdminProduct(productId)
    if (!existing) throw new ProductNotFoundError()

    const persistedImages = urlsPersistees(images)
    assertPersistedImagesAreOwned(existing.images, persistedImages)
    const draftIds = images.flatMap((image) =>
      image.kind === "brouillon" ? [image.draftId] : []
    )

    if (draftIds.length === 0) {
      await updateProduct(productId, {
        ...input,
        images: persistedImages,
      })
      redirect("/admin/produits")
    }

    const resultat = await cycleVieImageProduit.revendiquerEtEnregistrer({
      tentativeId,
      ownerId: client.id,
      draftIds,
      resultatDejaPersiste: async (productId) => {
        const product = await getAdminProduct(productId)
        if (!product) throw new Error("Produit enregistré introuvable")
        return product
      },
      enregistrer: async (promoted, lier) => {
        const product = await updateProduct(
          productId,
          {
            ...input,
            images: urlsGalerieMiseAJour(images, promoted),
          },
          undefined,
          {
            lier,
            promues: promoted.map((image) => image.publicUrl),
          }
        )
        return { productId: product.id, result: product }
      },
    })
    if (!resultat.ok) throw new UserFacingError(resultat.message)

    redirect("/admin/produits")
  },
})

export const deleteProductAction = adminTaskAction<{ productId: string }>({
  next: "/admin/produits",
  parse: (formData) => ({ productId: parseRequiredId(formData, "productId") }),
  run: async ({ productId }) => {
    await deleteProduct(productId)
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
    await updateVariantStock(variantId, stock)
  },
})
