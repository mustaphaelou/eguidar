import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  fetchCategoryPageData,
  fetchHomeData,
  fetchProductPageData,
} from "@/lib/use-cases/storefront"

/**
 * Deux Produits sans Structure (ADR-0029), écrits en base comme seule source
 * peut les écrire : la suppression d'une Structure. **Deux, jamais un** — c'est
 * le second qui rend la première épreuve capable de échouer, une requête
 * `categoryId: null` appariait tous les orphelins sans avoir besoin de les
 * compter.
 */
async function creerDeuxProduitsSansStructure() {
  for (const suffixe of ["orphelin", "orphelin-bis"]) {
    await prisma.product.create({
      data: {
        name: `Produit sans Structure ${suffixe}`,
        slug: pSlug(suffixe),
        description: "desc",
        brand: "Marque",
        price: 150000,
        specs: {},
        images: [],
        categoryId: null,
      },
    })
  }
}

const runId = randomUUID().slice(0, 8)
const pSlug = (suffix: string) => `p-${runId}-${suffix}`
const cSlug = (suffix: string) => `sf-${runId}-${suffix}`

/**
 * Colonnes `images` et `specs` stockées hors de leur forme : une galerie
 * qui n'est pas un tableau, des spécifications qui ne sont pas une série
 * d'entrées. La boutique lit ce que le Catalogue a laissé écrire et rend
 * la page quand même.
 */
const GALERIE_HORS_FORME = { url: "https://example.com/pas-un-tableau.jpg" }
const SPECS_HORS_FORME = "Écran : 6 pouces"

/**
 * Des spécifications **à moitié crédibles** : une vraie série d'entrées dont
 * une seule valeur n'est pas une chaîne. Ce n'est pas une colonne hors de sa
 * forme — c'est une forme que le Catalogue n'écrit pas (`z.record(z.string(),
 * z.string())` refuse un nombre), donc une rangée latente. Le verdict est
 * néanmoins épinglé de bout en bout, parce que c'est la seule forme dont
 * le tri des deux règles diverge : la galerie garde ses membres lisibles, les
 * spécifications non.
 */
const SPECS_A_MOITIE_CREDIBLES = { Écran: "6", Poids: 200 }

interface SeedProduct {
  name: string
  slug: string
  brand: string
  price: number
  /** Les colonnes JSON telles qu'elles sont stockées : cette suite écrit
   * volontairement des valeurs hors de leur forme, que la mutation refuse. */
  images: Prisma.InputJsonValue
  specs?: Prisma.InputJsonValue
  isFeatured?: boolean
  featuredOrder?: number
  freeShipping?: boolean
  createdAt?: Date
  variants: { name: string; sku: string; priceDelta: number; stock: number }[]
}

async function createProduct(categorySlug: string, product: SeedProduct) {
  const category = await prisma.category.findUniqueOrThrow({
    where: { slug: categorySlug },
  })
  return prisma.product.create({
    data: {
      name: product.name,
      slug: product.slug,
      description: "Description de test",
      brand: product.brand,
      categoryId: category.id,
      price: product.price,
      specs: product.specs ?? { Écran: '6.1"' },
      images: product.images,
      isFeatured: product.isFeatured ?? false,
      featuredOrder: product.featuredOrder ?? 0,
      freeShipping: product.freeShipping ?? false,
      ...(product.createdAt ? { createdAt: product.createdAt } : {}),
      variants: { create: product.variants },
    },
    include: { variants: true, category: true },
  })
}

describe("storefront browse", () => {
  beforeAll(async () => {
    const root = await prisma.category.create({
      data: { name: "Racine", slug: cSlug("root") },
    })
    const child = await prisma.category.create({
      data: { name: "Enfant", slug: cSlug("child"), parentId: root.id },
    })
    await prisma.category.create({
      data: { name: "Petit-fils", slug: cSlug("grand"), parentId: child.id },
    })
    await prisma.category.create({
      data: { name: "Indépendante", slug: cSlug("other") },
    })
  })

  beforeEach(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `p-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `p-${runId}-` } },
    })
    await prisma.category.deleteMany({
      where: { slug: { startsWith: `sf-${runId}-` } },
    })
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
      variants: [
        { name: "Standard", sku: `SKU-${runId}-f3`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("root"), {
      name: "Non mise en avant",
      slug: pSlug("plain"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/plain.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-p1`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("root"), {
      name: "Première",
      slug: pSlug("feat-1"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/1.jpg"],
      isFeatured: true,
      featuredOrder: 1,
      variants: [
        { name: "Standard", sku: `SKU-${runId}-f1`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("root"), {
      name: "Deuxième",
      slug: pSlug("feat-2"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/2.jpg"],
      isFeatured: true,
      featuredOrder: 2,
      variants: [
        { name: "Standard", sku: `SKU-${runId}-f2`, priceDelta: 0, stock: 1 },
      ],
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
      variants: [
        { name: "Standard", sku: `SKU-${runId}-tr`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("child"), {
      name: "Produit enfant A",
      slug: pSlug("tree-child-a"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/ca.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-tca`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("child"), {
      name: "Produit enfant B",
      slug: pSlug("tree-child-b"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/cb.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-tcb`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("grand"), {
      name: "Produit petit-fils",
      slug: pSlug("tree-grand"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/g.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-tg`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("other"), {
      name: "Produit indépendant",
      slug: pSlug("tree-other"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/o.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-to`, priceDelta: 0, stock: 1 },
      ],
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
      variants: [
        { name: "Standard", sku: `SKU-${runId}-br`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("child"), {
      name: "Produit enfant",
      slug: pSlug("browse-child"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/c.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-bc`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("grand"), {
      name: "Produit petit-fils",
      slug: pSlug("browse-grand"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/g.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-bg`, priceDelta: 0, stock: 1 },
      ],
    })
    await createProduct(cSlug("other"), {
      name: "Produit indépendant",
      slug: pSlug("browse-other"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/o.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-bo`, priceDelta: 0, stock: 1 },
      ],
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
        {
          name: "256 Go",
          sku: `SKU-${runId}-d2`,
          priceDelta: 150000,
          stock: 3,
        },
        {
          name: "512 Go",
          sku: `SKU-${runId}-d3`,
          priceDelta: 350000,
          stock: 0,
        },
      ],
    })

    const detail = await fetchProductPageData(pSlug("detail"))

    expect(detail).not.toBeNull()
    expect(detail!.name).toBe("Produit détail")
    expect(detail!.brand).toBe("Marque Test")
    expect(detail!.minPrice).toBe(100000)
    expect(detail!.freeShipping).toBe(true)
    expect(detail!.images).toEqual([
      "https://example.com/a.jpg",
      "https://example.com/b.jpg",
    ])
    expect(detail!.variants.map((v) => v.sku)).toEqual([
      `SKU-${runId}-d1`,
      `SKU-${runId}-d2`,
      `SKU-${runId}-d3`,
    ])
    expect(detail!.variants[0]).toMatchObject({
      prix: 100000,
      stock: 10,
    })
    expect(detail!.variants[1]).toMatchObject({
      prix: 250000,
      stock: 3,
    })
    expect(detail!.variants[2]).toMatchObject({
      prix: 450000,
      stock: 0,
    })
    expect(detail!.categoryChain.map((c) => c.slug)).toEqual([
      cSlug("root"),
      cSlug("child"),
      cSlug("grand"),
    ])
  })

  it("product detail: negative priceDelta produces minPrice below base price and correct variant prix", async () => {
    await createProduct(cSlug("grand"), {
      name: "Produit avec remise variante",
      slug: pSlug("detail-negative-delta"),
      brand: "Marque Test",
      price: 100000,
      images: ["https://example.com/neg.jpg"],
      variants: [
        {
          name: "Promo",
          sku: `SKU-${runId}-neg1`,
          priceDelta: -20000,
          stock: 5,
        },
        { name: "Standard", sku: `SKU-${runId}-neg2`, priceDelta: 0, stock: 3 },
      ],
    })

    const detail = await fetchProductPageData(pSlug("detail-negative-delta"))
    expect(detail).not.toBeNull()
    expect(detail!.minPrice).toBe(80000)
    expect(detail!.variants[0]).toMatchObject({ prix: 80000, stock: 5 })
    expect(detail!.variants[1]).toMatchObject({ prix: 100000, stock: 3 })
  })

  it("product detail: product without variants has minPrice equal to base price and empty variants", async () => {
    await createProduct(cSlug("grand"), {
      name: "Produit sans variante",
      slug: pSlug("detail-no-variant"),
      brand: "Marque Test",
      price: 50000,
      images: ["https://example.com/novar.jpg"],
      variants: [],
    })

    const detail = await fetchProductPageData(pSlug("detail-no-variant"))
    expect(detail).not.toBeNull()
    expect(detail!.minPrice).toBe(50000)
    expect(detail!.variants).toEqual([])
  })

  it("product detail: des colonnes JSON hors de leur forme répondent des faits vides, le reste intact", async () => {
    // La lecture normalise les deux colonnes avec la règle partagée
    // (`urlsImagesProduit`, `specificationsProduit`). Avant, elle les
    // transtinguait à l'aveugle : un membre de galerie qui n'est pas une
    // chaîne atteignait le composant de galerie, et une valeur de `specs`
    // qui n'est pas un objet atteignait le `Object.entries` de la page
    // Produit. Une colonne abimée ne doit rendre que des faits vides —
    // jamais une page cassée, jamais une valeur à moitié crédible.
    await createProduct(cSlug("grand"), {
      name: "Produit aux colonnes abimées",
      slug: pSlug("detail-colonnes-hors-forme"),
      brand: "Marque Test",
      price: 80000,
      images: GALERIE_HORS_FORME,
      specs: SPECS_HORS_FORME,
      variants: [
        { name: "128 Go", sku: `SKU-${runId}-hc1`, priceDelta: 0, stock: 4 },
        {
          name: "256 Go",
          sku: `SKU-${runId}-hc2`,
          priceDelta: -10000,
          stock: 6,
        },
      ],
    })

    const detail = await fetchProductPageData(
      pSlug("detail-colonnes-hors-forme")
    )

    expect(detail).not.toBeNull()
    expect(detail!.images).toEqual([])
    expect(detail!.specs).toEqual({})
    // Le reste des faits ne dépend pas des deux colonnes : une colonne
    // abimée n'efface pas le Produit.
    expect(detail!.id).toBeTruthy()
    expect(detail!.name).toBe("Produit aux colonnes abimées")
    expect(detail!.slug).toBe(pSlug("detail-colonnes-hors-forme"))
    expect(detail!.minPrice).toBe(70000)
    expect(detail!.variants.map((v) => v.sku)).toEqual([
      `SKU-${runId}-hc1`,
      `SKU-${runId}-hc2`,
    ])
    expect(detail!.variants[0]).toMatchObject({ prix: 80000, stock: 4 })
    expect(detail!.variants[1]).toMatchObject({ prix: 70000, stock: 6 })
    expect(detail!.category?.slug).toBe(cSlug("grand"))
    expect(detail!.categoryChain.map((c) => c.slug)).toEqual([
      cSlug("root"),
      cSlug("child"),
      cSlug("grand"),
    ])
  })

  it("product detail: des spécifications à moitié crédibles répondent le record vide, le reste intact", async () => {
    // Le verdict que la règle des spécifications porte **en entier**, et que
    // ADR-0026 consigne : une seule valeur illisible disqualifie tout
    // l'enregistrement. Le filtre par entrée, lui, aurait laissé passer
    // `Écran : 6` — et la page Produit fait `Object.entries(data.specs)`, donc
    // une ligne de plus à l'écran. C'est le seul endroit où normaliser une
    // valeur malformée latente change ce qui rend ; aucune rangée de ce genre
    // n'existe en production, le Catalogue étant le seul écrivain de la
    // colonne et la validant.
    await createProduct(cSlug("grand"), {
      name: "Produit aux spécifications à moitié crédibles",
      slug: pSlug("detail-specs-a-moitie"),
      brand: "Marque Test",
      price: 90000,
      images: ["https://example.com/moitie.jpg"],
      specs: SPECS_A_MOITIE_CREDIBLES,
      variants: [
        { name: "Standard", sku: `SKU-${runId}-mc1`, priceDelta: 0, stock: 3 },
        { name: "XL", sku: `SKU-${runId}-mc2`, priceDelta: 5000, stock: 0 },
      ],
    })

    const detail = await fetchProductPageData(pSlug("detail-specs-a-moitie"))

    expect(detail).not.toBeNull()
    expect(detail!.specs).toEqual({})
    // Le reste des faits ne dépend pas de la colonne : une spécification
    // illisible n'efface pas le Produit.
    expect(detail!.id).toBeTruthy()
    expect(detail!.name).toBe("Produit aux spécifications à moitié crédibles")
    expect(detail!.slug).toBe(pSlug("detail-specs-a-moitie"))
    expect(detail!.minPrice).toBe(90000)
    expect(detail!.images).toEqual(["https://example.com/moitie.jpg"])
    expect(detail!.variants.map((v) => v.sku)).toEqual([
      `SKU-${runId}-mc1`,
      `SKU-${runId}-mc2`,
    ])
    expect(detail!.variants[0]).toMatchObject({ prix: 90000, stock: 3 })
    expect(detail!.variants[1]).toMatchObject({ prix: 95000, stock: 0 })
    expect(detail!.category?.slug).toBe(cSlug("grand"))
    expect(detail!.categoryChain.map((c) => c.slug)).toEqual([
      cSlug("root"),
      cSlug("child"),
      cSlug("grand"),
    ])
  })

  it("product detail: une galerie à moitié écrite ne livre que ses URL lisibles", async () => {
    // La galerie est un tableau dont certains membres ne sont pas des
    // chaînes : la règle partagée abandonne les membres illisibles au lieu
    // de les laisser filer jusqu'au composant de galerie, qui les aurait
    // rendus comme des URL.
    await createProduct(cSlug("grand"), {
      name: "Produit à la galerie abimée",
      slug: pSlug("detail-galerie-partielle"),
      brand: "Marque Test",
      price: 60000,
      images: [
        42,
        "https://example.com/premiere.jpg",
        null,
        { url: "https://example.com/ni-une-url.jpg" },
      ],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-gp1`, priceDelta: 0, stock: 2 },
      ],
    })

    const detail = await fetchProductPageData(pSlug("detail-galerie-partielle"))

    expect(detail!.images).toEqual(["https://example.com/premiere.jpg"])
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
        {
          name: "256 Go",
          sku: `SKU-${runId}-c2`,
          priceDelta: -50000,
          stock: 4,
        },
        {
          name: "512 Go",
          sku: `SKU-${runId}-c3`,
          priceDelta: 100000,
          stock: 1,
        },
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

  it("product detail: related strip holds same-category cards, self excluded, capped at eight, most recent first", async () => {
    await createProduct(cSlug("child"), {
      name: "Produit principal",
      slug: pSlug("related-self"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/self.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-rs`, priceDelta: 0, stock: 1 },
      ],
    })
    for (let index = 0; index < 10; index++) {
      await createProduct(cSlug("child"), {
        name: `Produit lié ${index}`,
        slug: pSlug(`rel-${index}`),
        brand: "Marque",
        price: 100000,
        images: [`https://example.com/rel-${index}.jpg`],
        variants: [
          {
            name: "128 Go",
            sku: `SKU-${runId}-r${index}a`,
            priceDelta: 0,
            stock: 2,
          },
          {
            name: "256 Go",
            sku: `SKU-${runId}-r${index}b`,
            priceDelta: -50000,
            stock: 4,
          },
        ],
        createdAt: new Date(Date.UTC(2026, 0, 1, 9, index)),
      })
    }
    await createProduct(cSlug("other"), {
      name: "Produit autre catégorie",
      slug: pSlug("rel-other"),
      brand: "Marque",
      price: 100000,
      images: ["https://example.com/other.jpg"],
      variants: [
        { name: "Standard", sku: `SKU-${runId}-ro`, priceDelta: 0, stock: 1 },
      ],
      createdAt: new Date(Date.UTC(2026, 0, 1, 23, 59)),
    })

    const detail = await fetchProductPageData(pSlug("related-self"))

    expect(detail).not.toBeNull()
    expect(detail!.related.map((p) => p.slug)).toEqual([
      pSlug("rel-9"),
      pSlug("rel-8"),
      pSlug("rel-7"),
      pSlug("rel-6"),
      pSlug("rel-5"),
      pSlug("rel-4"),
      pSlug("rel-3"),
      pSlug("rel-2"),
    ])
    expect(detail!.related.some((p) => p.slug === pSlug("related-self"))).toBe(
      false
    )
    expect(detail!.related.some((p) => p.slug === pSlug("rel-other"))).toBe(
      false
    )
    const newest = detail!.related[0]
    expect(newest.image).toBe("https://example.com/rel-9.jpg")
    expect(newest.minPrice).toBe(50000)
    expect(newest.totalStock).toBe(6)
  })

  // Le Produit sans Structure (ADR-0029).
  it("s'ouvre sans Structure, avec une chaîne de catégories vide", async () => {
    await creerDeuxProduitsSansStructure()

    const detail = await fetchProductPageData(pSlug("orphelin"))

    // Le fait est nul, et il est dit tel quel plutôt que masqué par une
    // Structure de remplacement : une page qui afficherait « Sans Structure »
    // comme si c'était une catégorie mentirait sur son propre fil d'Ariane.
    expect(detail!.category).toBeNull()
    // La chaîne se dégrade en vide — c'est de là que la page construit
    // `Accueil › Tous nos produits › <nom>` sans changer de code.
    expect(detail!.categoryChain).toEqual([])
  })

  it("n'apparie pas les Produits sans Structure entre eux comme Produits liés", async () => {
    // Le piège : `where: { categoryId: product.categoryId }` rendu tel quel
    // vaut « `IS NULL` » chez Prisma, et la requête **appariait tous les
    // autres** Produits sans Structure. Aucun de ces deux ne partage de
    // Structure avec quoi que ce soit ; le « Vous aimerez aussi » n'a donc
    // rien à proposer, et le dire est mieux que le faire au hasard.
    await creerDeuxProduitsSansStructure()

    const detail = await fetchProductPageData(pSlug("orphelin"))

    expect(detail!.related).toEqual([])
    await expect(
      prisma.product.count({ where: { categoryId: null } })
    ).resolves.toBeGreaterThanOrEqual(2)
  })

  it("unknown slugs return null", async () => {
    await expect(
      fetchCategoryPageData("categorie-inconnue")
    ).resolves.toBeNull()
    await expect(fetchProductPageData("produit-inconnu")).resolves.toBeNull()
  })
})
