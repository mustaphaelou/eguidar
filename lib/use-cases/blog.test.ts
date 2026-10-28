import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import { fetchArticleParSlug, fetchBlogLanding } from "@/lib/use-cases/blog"

const runId = randomUUID().slice(0, 8)
const bSlug = (suffix: string) => `b-${runId}-${suffix}`

interface SeedVariant {
  name: string
  sku: string
  priceDelta: number
  stock: number
}

function makeInput(input: {
  suffix: string
  statut?: "brouillon" | "publie" | "archive"
  publishedAt?: Date | null
  titre?: string
  extrait?: string
  couverture?: string | null
  contenu?: string
  notes?: string | null
  themeSlug?: string
}) {
  const statut = input.statut ?? "brouillon"
  return {
    titre: input.titre ?? "Guide de test",
    slug: bSlug(input.suffix),
    extrait: input.extrait ?? "Un extrait de test",
    couverture: input.couverture ?? null,
    contenu: input.contenu ?? "Un contenu de test",
    notes: input.notes ?? null,
    statut,
    publishedAt:
      input.publishedAt === undefined
        ? statut === "publie"
          ? new Date()
          : null
        : input.publishedAt,
    theme: { connect: { slug: input.themeSlug ?? "guides" } },
  }
}

async function creerArticle(input: Parameters<typeof makeInput>[0]) {
  return prisma.articleBlog.create({ data: makeInput(input) })
}

async function createProduit(
  suffix: string,
  overrides: {
    price?: number
    images?: string[]
    freeShipping?: boolean
    variants?: SeedVariant[]
  } = {}
) {
  return prisma.product.create({
    data: {
      name: `Produit ${suffix}`,
      slug: bSlug(`prod-${suffix}`),
      description: "Description de test",
      brand: "Marque",
      price: overrides.price ?? 100000,
      specs: {},
      images: overrides.images ?? [`https://example.com/${suffix}.jpg`],
      freeShipping: overrides.freeShipping ?? false,
      variants: {
        create: overrides.variants ?? [
          {
            name: "Standard",
            sku: `SKU-${runId}-${suffix}`,
            priceDelta: 0,
            stock: 5,
          },
        ],
      },
    },
    include: { variants: true },
  })
}

async function attacherProduits(articleId: string, productIds: string[]) {
  await prisma.articleBlogProduit.createMany({
    data: productIds.map((productId, ordre) => ({
      articleId,
      productId,
      ordre,
    })),
  })
}

describe("blog lecture publique", () => {
  beforeAll(async () => {
    await prisma.theme.upsert({
      where: { slug: "guides" },
      update: {},
      create: { slug: "guides", nom: "Guides" },
    })
    await prisma.theme.upsert({
      where: { slug: "annonces" },
      update: {},
      create: { slug: "annonces", nom: "Annonces" },
    })
  })

  beforeEach(async () => {
    await prisma.articleBlogProduit.deleteMany({
      where: { article: { slug: { startsWith: `b-${runId}-` } } },
    })
    await prisma.articleBlog.deleteMany({
      where: { slug: { startsWith: `b-${runId}-` } },
    })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `b-${runId}-prod-` } },
    })
  })

  afterAll(async () => {
    await prisma.articleBlogProduit.deleteMany({
      where: { article: { slug: { startsWith: `b-${runId}-` } } },
    })
    await prisma.articleBlog.deleteMany({
      where: { slug: { startsWith: `b-${runId}-` } },
    })
    await prisma.product.deleteMany({
      where: { slug: { startsWith: `b-${runId}-prod-` } },
    })
    await prisma.$disconnect()
  })

  describe("page Article de blog", () => {
    it("returns the full detail shape for a publie article", async () => {
      const article = await creerArticle({
        suffix: "detail",
        statut: "publie",
        titre: "Bien choisir son smartphone",
        extrait: "Nos conseils pour un achat serein.",
        couverture: "https://example.com/smartphone.jpg",
        contenu: "Premier paragraphe.\n\nDeuxième paragraphe.",
        notes: "Prix TTC indicatif.\nDisponibilité confirmée à la commande.",
        themeSlug: "annonces",
      })

      const lu = await fetchArticleParSlug(bSlug("detail"))

      expect(lu).toMatchObject({
        titre: "Bien choisir son smartphone",
        slug: bSlug("detail"),
        extrait: "Nos conseils pour un achat serein.",
        couverture: "https://example.com/smartphone.jpg",
        contenu: "Premier paragraphe.\n\nDeuxième paragraphe.",
        notes: "Prix TTC indicatif.\nDisponibilité confirmée à la commande.",
        theme: { slug: "annonces", nom: "Annonces" },
        statut: "publie",
        produits: [],
      })
      expect(lu?.id).toBe(article.id)
      expect(lu?.publishedAt).toBeInstanceOf(Date)
    })

    it("returns null for an unknown slug", async () => {
      await expect(fetchArticleParSlug(bSlug("inexistant"))).resolves.toBeNull()
    })

    it("returns null for a brouillon slug", async () => {
      await creerArticle({ suffix: "detail-brouillon" })

      await expect(
        fetchArticleParSlug(bSlug("detail-brouillon"))
      ).resolves.toBeNull()
    })
  })

  describe("landing", () => {
    it("lists publie articles newest first with the hero split from the feed", async () => {
      await creerArticle({
        suffix: "ordre-ancien",
        statut: "publie",
        publishedAt: new Date("2026-01-10T10:00:00Z"),
      })
      await creerArticle({
        suffix: "ordre-moyen",
        statut: "publie",
        publishedAt: new Date("2026-02-10T10:00:00Z"),
      })
      await creerArticle({
        suffix: "ordre-recent",
        statut: "publie",
        publishedAt: new Date("2026-03-10T10:00:00Z"),
      })

      const landing = await fetchBlogLanding()

      expect(landing.hero?.slug).toBe(bSlug("ordre-recent"))
      expect(landing.hero?.theme).toMatchObject({
        slug: "guides",
        nom: "Guides",
      })
      expect(landing.hero?.publishedAt).toBeInstanceOf(Date)
      expect(landing.articles.map((article) => article.slug)).toEqual([
        bSlug("ordre-moyen"),
        bSlug("ordre-ancien"),
      ])
    })

    it("never lists brouillon articles on the landing", async () => {
      await creerArticle({ suffix: "reste-brouillon" })
      await creerArticle({ suffix: "visible", statut: "publie" })

      const landing = await fetchBlogLanding()

      expect(landing.hero?.slug).toBe(bSlug("visible"))
      expect(landing.articles.map((article) => article.slug)).not.toContain(
        bSlug("reste-brouillon")
      )
    })

    it("returns an empty landing when nothing is publie", async () => {
      await creerArticle({ suffix: "seul-brouillon" })

      await expect(fetchBlogLanding()).resolves.toEqual({
        hero: null,
        articles: [],
      })
    })

    it("excludes an archived article from the landing but keeps its URL resolving", async () => {
      await creerArticle({
        suffix: "archive-visible",
        statut: "archive",
        publishedAt: new Date("2026-02-10T10:00:00Z"),
      })
      await creerArticle({ suffix: "archive-autre", statut: "publie" })

      const landing = await fetchBlogLanding()
      expect([
        landing.hero?.slug,
        ...landing.articles.map((a) => a.slug),
      ]).not.toContain(bSlug("archive-visible"))
      expect(landing.hero?.slug).toBe(bSlug("archive-autre"))

      await expect(
        fetchArticleParSlug(bSlug("archive-visible"))
      ).resolves.toMatchObject({
        titre: "Guide de test",
        slug: bSlug("archive-visible"),
        contenu: "Un contenu de test",
        statut: "archive",
      })

      const resolu = await fetchArticleParSlug(bSlug("archive-visible"))
      expect(resolu?.publishedAt).toBeInstanceOf(Date)
    })
  })

  describe("produits liés", () => {
    it("rend les produits liés dans l'ordre de leurs liens", async () => {
      const article = await creerArticle({
        suffix: "lies-ordre",
        statut: "publie",
      })
      const p1 = await createProduit("ordre-1")
      const p2 = await createProduit("ordre-2")
      const p3 = await createProduit("ordre-3")

      await attacherProduits(article.id, [p3.id, p1.id, p2.id])

      const lu = await fetchArticleParSlug(bSlug("lies-ordre"))
      expect(lu?.produits.map((produit) => produit.slug)).toEqual([
        p3.slug,
        p1.slug,
        p2.slug,
      ])
    })

    it("expose des cartes catalogue avec minPrice calculé (ADR-0013)", async () => {
      const article = await creerArticle({
        suffix: "lies-prix",
        statut: "publie",
      })
      const produit = await createProduit("prix", {
        price: 100000,
        freeShipping: true,
        images: ["https://example.com/prix.jpg"],
        variants: [
          {
            name: "Base",
            sku: `SKU-${runId}-prix-base`,
            priceDelta: 0,
            stock: 5,
          },
          {
            name: "Remise",
            sku: `SKU-${runId}-prix-remise`,
            priceDelta: -20000,
            stock: 3,
          },
          {
            name: "Premium",
            sku: `SKU-${runId}-prix-prem`,
            priceDelta: 10000,
            stock: 2,
          },
        ],
      })

      await attacherProduits(article.id, [produit.id])

      const lu = await fetchArticleParSlug(bSlug("lies-prix"))

      expect(lu?.produits).toHaveLength(1)
      expect(lu?.produits[0]).toMatchObject({
        id: produit.id,
        slug: produit.slug,
        brand: "Marque",
        image: "https://example.com/prix.jpg",
        minPrice: 80000,
        totalStock: 10,
        freeShipping: true,
      })
      expect(lu?.produits[0].varianteId).toBeTruthy()
    })

    it("masque un produit supprimé, l'article reste en ligne", async () => {
      const article = await creerArticle({
        suffix: "lies-supprime",
        statut: "publie",
      })
      const garde = await createProduit("garde")
      const supprime = await createProduit("supprime")

      await attacherProduits(article.id, [garde.id, supprime.id])
      await prisma.product.delete({ where: { id: supprime.id } })

      const lu = await fetchArticleParSlug(bSlug("lies-supprime"))

      expect(lu?.statut).toBe("publie")
      expect(lu?.produits.map((produit) => produit.slug)).toEqual([garde.slug])
    })

    it("masque un produit en rupture (totalStock === 0), l'article reste en ligne", async () => {
      const article = await creerArticle({
        suffix: "lies-rupture",
        statut: "publie",
      })
      const disponible = await createProduit("dispo")
      const rupture = await createProduit("rupture", {
        variants: [
          {
            name: "Standard",
            sku: `SKU-${runId}-rupture`,
            priceDelta: 0,
            stock: 0,
          },
        ],
      })

      await attacherProduits(article.id, [disponible.id, rupture.id])

      const lu = await fetchArticleParSlug(bSlug("lies-rupture"))

      expect(lu?.statut).toBe("publie")
      expect(lu?.produits.map((produit) => produit.slug)).toEqual([
        disponible.slug,
      ])
    })
  })
})
