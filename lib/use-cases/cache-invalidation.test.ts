import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  CATEGORY_TAG,
  HOME_TAG,
  invalidateCatalogue,
  invalidateCommande,
  invalidateLivraison,
  invalidateStructure,
  PRODUCT_TAG,
  productDetailTag,
  SHIPPING_TAG,
} from "@/lib/use-cases/cache-invalidation"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}))

import { revalidatePath, revalidateTag } from "next/cache"

const mockedRevalidateTag = vi.mocked(revalidateTag)
const mockedRevalidatePath = vi.mocked(revalidatePath)

describe("cache invalidation vocabulary", () => {
  it("exposes the storefront cache tag strings", () => {
    expect(PRODUCT_TAG).toBe("products")
    expect(CATEGORY_TAG).toBe("categories")
    expect(HOME_TAG).toBe("home")
    expect(SHIPPING_TAG).toBe("shipping")
  })

  it("exposes the product detail tag builder", () => {
    expect(productDetailTag("mon-produit")).toBe("product:mon-produit")
  })
})

describe("invalidateCatalogue", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the catalogue, product detail and home tags plus the admin product pages", () => {
    invalidateCatalogue({ id: "p1", slug: "mon-produit" })

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(3)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(PRODUCT_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(productDetailTag("mon-produit"), "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(HOME_TAG, "max")
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/produits")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/produits/p1")
  })

  it("invalidates the previous slug detail tag when the product changed slug", () => {
    invalidateCatalogue({ id: "p1", slug: "nouveau-slug", previousSlug: "ancien-slug" })

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(4)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(productDetailTag("nouveau-slug"), "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(productDetailTag("ancien-slug"), "max")
  })

  it("does not invalidate the previous slug tag when it equals the new slug", () => {
    invalidateCatalogue({ id: "p1", slug: "meme-slug", previousSlug: "meme-slug" })

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(3)
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2)
  })
})

describe("invalidateStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the categories, catalogue and home tags plus the admin categories page", () => {
    invalidateStructure()

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(3)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(CATEGORY_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(PRODUCT_TAG, "max")
    expect(mockedRevalidateTag).toHaveBeenCalledWith(HOME_TAG, "max")
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(1)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/categories")
  })
})

describe("invalidateLivraison", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the shipping tag plus the admin villes and livraison pages", () => {
    invalidateLivraison()

    expect(mockedRevalidateTag).toHaveBeenCalledTimes(1)
    expect(mockedRevalidateTag).toHaveBeenCalledWith(SHIPPING_TAG, "max")
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(2)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/villes")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/livraison")
  })
})

describe("invalidateCommande", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("invalidates the admin and customer order pages for the order", () => {
    invalidateCommande("order-42")

    expect(mockedRevalidateTag).not.toHaveBeenCalled()
    expect(mockedRevalidatePath).toHaveBeenCalledTimes(5)
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/commandes")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/admin/commandes/order-42")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/commandes")
    expect(mockedRevalidatePath).toHaveBeenCalledWith("/commande/confirmation/order-42")
  })
})
