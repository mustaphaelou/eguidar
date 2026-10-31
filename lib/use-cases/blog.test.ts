import { randomUUID } from "node:crypto"

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"

import { prisma } from "@/lib/db"
import {
  fetchArticleParSlug,
  fetchArticleSlugs,
  fetchArticlesLies,
  fetchBlogLanding,
} from "@/lib/use-cases/blog"

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
  chapo?: string | null
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
    chapo: input.chapo ?? null,
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
        chapo: "Trois critères suffisent pour choisir sans se tromper.",
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
        chapo: "Trois critères suffisent pour choisir sans se tromper.",
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

    it("renvoie chapo null pour un Article qui n'en a pas", async () => {
      await creerArticle({
        suffix: "detail-sans-chapo",
        statut: "publie",
        extrait: "L'extrait tient lieu de Chapô.",
      })

      const lu = await fetchArticleParSlug(bSlug("detail-sans-chapo"))

      expect(lu).toMatchObject({
        extrait: "L'extrait tient lieu de Chapô.",
        chapo: null,
      })
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

  describe("l'horloge de publication", () => {
    it("ne rend un Article qu'entre sa date de publication et maintenant", async () => {
      const moinsUneMinute = new Date(Date.now() - 60_000)
      const demain = new Date(Date.now() + 24 * 60 * 60 * 1000)
      const passe = await creerArticle({
        suffix: "horloge-passe",
        statut: "publie",
        publishedAt: moinsUneMinute,
      })
      const futur = await creerArticle({
        suffix: "horloge-futur",
        statut: "publie",
        publishedAt: demain,
      })
      const sansDate = await creerArticle({
        suffix: "horloge-sans-date",
        statut: "publie",
        publishedAt: null,
      })

      const landing = await fetchBlogLanding()
      const slugsDeLaLanding = [
        landing.hero?.slug,
        ...landing.articles.map((article) => article.slug),
      ]

      expect(slugsDeLaLanding).toContain(passe.slug)
      expect(slugsDeLaLanding).not.toContain(futur.slug)
      expect(slugsDeLaLanding).not.toContain(sansDate.slug)

      await expect(fetchArticleParSlug(passe.slug)).resolves.toMatchObject({
        slug: passe.slug,
      })
      await expect(fetchArticleParSlug(futur.slug)).resolves.toBeNull()
      await expect(fetchArticleParSlug(sansDate.slug)).resolves.toBeNull()

      const slugsPrets = await fetchArticleSlugs()

      expect(slugsPrets).toContain(passe.slug)
      expect(slugsPrets).not.toContain(futur.slug)
      expect(slugsPrets).not.toContain(sansDate.slug)
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

  describe("articles liés", () => {
    it("sert d'abord les Articles du même Thème, du plus récent au plus ancien, sans dépasser trois", async () => {
      await creerArticle({
        suffix: "lies-courant",
        statut: "publie",
        publishedAt: new Date("2026-01-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-guides-recent",
        statut: "publie",
        titre: "Le guide le plus récent",
        publishedAt: new Date("2026-03-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-guides-moyen",
        statut: "publie",
        publishedAt: new Date("2026-02-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-guides-ancien",
        statut: "publie",
        publishedAt: new Date("2026-01-15T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-annonces-recent",
        statut: "publie",
        publishedAt: new Date("2026-04-01T10:00:00Z"),
        themeSlug: "annonces",
      })

      const lies = await fetchArticlesLies(bSlug("lies-courant"), "guides")

      expect(lies.map((article) => article.slug)).toEqual([
        bSlug("lies-guides-recent"),
        bSlug("lies-guides-moyen"),
        bSlug("lies-guides-ancien"),
      ])
      expect(lies[0]).toMatchObject({
        titre: "Le guide le plus récent",
        couverture: null,
        theme: { slug: "guides", nom: "Guides" },
      })
      expect(lies[0].publishedAt).toBeInstanceOf(Date)
    })

    it("complète avec d'autres Thèmes quand le Thème de l'Article est trop mince", async () => {
      await creerArticle({
        suffix: "lies-courant-thin",
        statut: "publie",
        publishedAt: new Date("2026-01-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-guides-seul",
        statut: "publie",
        publishedAt: new Date("2026-02-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-annonces-recent",
        statut: "publie",
        publishedAt: new Date("2026-04-01T10:00:00Z"),
        themeSlug: "annonces",
      })
      await creerArticle({
        suffix: "lies-annonces-ancien",
        statut: "publie",
        publishedAt: new Date("2026-03-01T10:00:00Z"),
        themeSlug: "annonces",
      })

      const lies = await fetchArticlesLies(bSlug("lies-courant-thin"), "guides")

      expect(lies.map((article) => [article.slug, article.theme.slug])).toEqual(
        [
          [bSlug("lies-guides-seul"), "guides"],
          [bSlug("lies-annonces-recent"), "annonces"],
          [bSlug("lies-annonces-ancien"), "annonces"],
        ]
      )
    })

    it("exclut l'Article courant de la sélection", async () => {
      await creerArticle({
        suffix: "lies-courant-exclu",
        statut: "publie",
        publishedAt: new Date("2026-04-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-guides-autre",
        statut: "publie",
        publishedAt: new Date("2026-03-01T10:00:00Z"),
        themeSlug: "guides",
      })

      const lies = await fetchArticlesLies(
        bSlug("lies-courant-exclu"),
        "guides"
      )

      expect(lies.map((article) => article.slug)).toEqual([
        bSlug("lies-guides-autre"),
      ])
    })

    it("n'offre jamais un Brouillon ni un Archivé", async () => {
      await creerArticle({
        suffix: "lies-courant-statuts",
        statut: "publie",
        publishedAt: new Date("2026-01-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-brouillon-recent",
        statut: "brouillon",
        publishedAt: new Date("2026-05-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-archive-recent",
        statut: "archive",
        publishedAt: new Date("2026-04-01T10:00:00Z"),
        themeSlug: "guides",
      })
      await creerArticle({
        suffix: "lies-publie",
        statut: "publie",
        publishedAt: new Date("2026-02-01T10:00:00Z"),
        themeSlug: "guides",
      })

      const lies = await fetchArticlesLies(
        bSlug("lies-courant-statuts"),
        "guides"
      )

      expect(lies.map((article) => article.slug)).toEqual([
        bSlug("lies-publie"),
      ])
    })

    it("retourne une liste vide quand l'Article est seul", async () => {
      await creerArticle({
        suffix: "lies-courant-seul",
        statut: "publie",
        publishedAt: new Date("2026-01-01T10:00:00Z"),
        themeSlug: "guides",
      })

      await expect(
        fetchArticlesLies(bSlug("lies-courant-seul"), "guides")
      ).resolves.toEqual([])
    })
  })
})
