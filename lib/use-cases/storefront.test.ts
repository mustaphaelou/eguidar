import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  fetchCategoryPageData,
  fetchHomeData,
  fetchProductPageData,
} from "@/lib/use-cases/storefront"

const runId = randomUUID().slice(0, 8)
const pSlug = (suffix: string) => `p-${runId}-${suffix}`
const cSlug = (suffix: string) => `sf-${runId}-${suffix}`

interface SeedProduct {
  name: string
  slug: string
  brand: string
  price: number
  images: string[]
  isFeatured?: boolean
  featuredOrder?: number
  freeShipping?: boolean
  variants: { name: string; sku: string; priceDelta: number; stock: number }[]
}

async function createProduct(categorySlug: string, product: SeedProduct) {
  const category = await prisma.category.findUniqueOrThrow({ where: { slug: categorySlug } })
  return prisma.product.create({
    data: {
      name: product.name,
      slug: product.slug,
      description: "Description de test",
      brand: product.brand,
      categoryId: category.id,
      price: product.price,
      specs: { Écran: '6.1"' },
      images: product.images,
      isFeatured: product.isFeatured ?? false,
      featuredOrder: product.featuredOrder ?? 0,
      freeShipping: product.freeShipping ?? false,
      variants: { create: product.variants },
    },
    include: { variants: true, category: true },
  })
}

describe("storefront browse", () => {
  beforeAll(async () => {
    const root = await prisma.category.create({ data: { name: "Racine", slug: cSlug("root") } })
    const child = await prisma.category.create({
      data: { name: "Enfant", slug: cSlug("child"), parentId: root.id },
    })
    await prisma.category.create({
      data: { name: "Petit-fils", slug: cSlug("grand"), parentId: child.id },
    })
    await prisma.category.create({ data: { name: "Indépendante", slug: cSlug("other") } })
  })

  beforeEach(async () => {
    await prisma.product.deleteMany({ where: { slug: { startsWith: `p-${runId}-` } } })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { slug: { startsWith: `p-${runId}-` } } })
    await prisma.category.deleteMany({ where: { slug: { startsWith: `sf-${runId}-` } } })
    await prisma.$disconnect()
  })

  it("home: featured products honor the flag and the featuredOrder, excluding others", async () => {
    await createProduct(cSlug("root"), {
      name: "Troisième",
      slug: pSlug("feat-3"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/3.jpg"],
      isFeatured: true,
      featuredOrder: 3,
      variants: [{ name: "Standard", sku: `SKU-${runId}-f3`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("root"), {
      name: "Non mise en avant",
      slug: pSlug("plain"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/plain.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-p1`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("root"), {
      name: "Première",
      slug: pSlug("feat-1"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/1.jpg"],
      isFeatured: true,
      featuredOrder: 1,
      variants: [{ name: "Standard", sku: `SKU-${runId}-f1`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("root"), {
      name: "Deuxième",
      slug: pSlug("feat-2"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/2.jpg"],
      isFeatured: true,
      featuredOrder: 2,
      variants: [{ name: "Standard", sku: `SKU-${runId}-f2`, priceDelta: 0, stock: 1 }],
    })

    const home = await fetchHomeData()

    expect(home.featured.map((p) => p.slug)).toEqual([
      pSlug("feat-1"),
      pSlug("feat-2"),
      pSlug("feat-3"),
    ])
    expect(home.featured.some((p) => p.slug === pSlug("plain"))).toBe(false)
  })

  it("home: builds the category tree with descendant-inclusive product counts", async () => {
    await createProduct(cSlug("root"), {
      name: "Produit racine",
      slug: pSlug("tree-root"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/r.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-tr`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("child"), {
      name: "Produit enfant A",
      slug: pSlug("tree-child-a"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/ca.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-tca`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("child"), {
      name: "Produit enfant B",
      slug: pSlug("tree-child-b"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/cb.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-tcb`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("grand"), {
      name: "Produit petit-fils",
      slug: pSlug("tree-grand"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/g.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-tg`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("other"), {
      name: "Produit indépendant",
      slug: pSlug("tree-other"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/o.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-to`, priceDelta: 0, stock: 1 }],
    })

    const home = await fetchHomeData()

    const root = home.categories.find((c) => c.slug === cSlug("root"))
    expect(root).toBeDefined()
    expect(root!.productCount).toBe(4)
    expect(root!.children).toHaveLength(1)

    const child = root!.children[0]
    expect(child.slug).toBe(cSlug("child"))
    expect(child.productCount).toBe(3)
    expect(child.children).toHaveLength(1)
    expect(child.children[0]).toMatchObject({
      slug: cSlug("grand"),
      productCount: 1,
      children: [],
    })

    const other = home.categories.find((c) => c.slug === cSlug("other"))
    expect(other!.productCount).toBe(1)
  })

  it("category browse: includes products of descendant categories, excludes the rest", async () => {
    await createProduct(cSlug("root"), {
      name: "Produit racine",
      slug: pSlug("browse-root"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/r.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-br`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("child"), {
      name: "Produit enfant",
      slug: pSlug("browse-child"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/c.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-bc`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("grand"), {
      name: "Produit petit-fils",
      slug: pSlug("browse-grand"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/g.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-bg`, priceDelta: 0, stock: 1 }],
    })
    await createProduct(cSlug("other"), {
      name: "Produit indépendant",
      slug: pSlug("browse-other"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/o.jpg"],
      variants: [{ name: "Standard", sku: `SKU-${runId}-bo`, priceDelta: 0, stock: 1 }],
    })

    const childPage = await fetchCategoryPageData(cSlug("child"))
    expect(childPage!.category.slug).toBe(cSlug("child"))
    expect(childPage!.children.map((c) => c.slug)).toEqual([cSlug("grand")])
    expect(childPage!.products.map((p) => p.slug).sort()).toEqual([
      pSlug("browse-child"),
      pSlug("browse-grand"),
    ])

    const rootPage = await fetchCategoryPageData(cSlug("root"))
    expect(rootPage!.children.map((c) => c.slug)).toEqual([cSlug("child")])
    expect(rootPage!.products.map((p) => p.slug).sort()).toEqual([
      pSlug("browse-child"),
      pSlug("browse-grand"),
      pSlug("browse-root"),
    ])
  })

  it("category browse: exposes the full root-to-current chain with the current category last", async () => {
    const grandPage = await fetchCategoryPageData(cSlug("grand"))
    expect(grandPage!.categoryChain.map((c) => c.slug)).toEqual([
      cSlug("root"),
      cSlug("child"),
      cSlug("grand"),
    ])

    const rootPage = await fetchCategoryPageData(cSlug("root"))
    expect(rootPage!.categoryChain.map((c) => c.slug)).toEqual([cSlug("root")])
  })

  it("product detail: variants ordered by createdAt with priceDelta and stock", async () => {
    await createProduct(cSlug("grand"), {
      name: "Produit détail",
      slug: pSlug("detail"),
      brand: "Marque Test",
      price: 100000,
      images: ["https://example.com/a.jpg", "https://example.com/b.jpg"],
      freeShipping: true,
      variants: [
        { name: "128 Go", sku: `SKU-${runId}-d1`, priceDelta: 0, stock: 10 },
        { name: "256 Go", sku: `SKU-${runId}-d2`, priceDelta: 150000, stock: 3 },
        { name: "512 Go", sku: `SKU-${runId}-d3`, priceDelta: 350000, stock: 0 },
      ],
    })

    const detail = await fetchProductPageData(pSlug("detail"))

    expect(detail).not.toBeNull()
    expect(detail!.name).toBe("Produit détail")
    expect(detail!.brand).toBe("Marque Test")
    expect(detail!.price).toBe(100000)
    expect(detail!.freeShipping).toBe(true)
    expect(detail!.images).toEqual(["https://example.com/a.jpg", "https://example.com/b.jpg"])
    expect(detail!.variants.map((v) => v.sku)).toEqual([
      `SKU-${runId}-d1`,
      `SKU-${runId}-d2`,
      `SKU-${runId}-d3`,
    ])
    expect(detail!.variants[1]).toMatchObject({ priceDelta: 150000, stock: 3 })
    expect(detail!.variants[2]).toMatchObject({ stock: 0 })
    expect(detail!.categoryChain.map((c) => c.slug)).toEqual([
      cSlug("root"),
      cSlug("child"),
      cSlug("grand"),
    ])
  })

  it("product cards expose the first image, the lowest price and the total stock", async () => {
    await createProduct(cSlug("child"), {
      name: "Produit carte",
      slug: pSlug("card"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
      variants: [
        { name: "128 Go", sku: `SKU-${runId}-c1`, priceDelta: 0, stock: 2 },
        { name: "256 Go", sku: `SKU-${runId}-c2`, priceDelta: -50000, stock: 4 },
        { name: "512 Go", sku: `SKU-${runId}-c3`, priceDelta: 100000, stock: 1 },
      ],
    })

    const home = await fetchHomeData()
    const root = home.categories.find((c) => c.slug === cSlug("root"))!
    const child = root.children.find((c) => c.slug === cSlug("child"))!
    const page = await fetchCategoryPageData(cSlug("child"))

    const card = page!.products[0]
    expect(card.image).toBe("https://example.com/1.jpg")
    expect(card.minPrice).toBe(50000)
    expect(card.totalStock).toBe(7)
    expect(child).toBeDefined()
  })

  it("unknown slugs return null", async () => {
    await expect(fetchCategoryPageData("categorie-inconnue")).resolves.toBeNull()
    await expect(fetchProductPageData("produit-inconnu")).resolves.toBeNull()
  })
})
