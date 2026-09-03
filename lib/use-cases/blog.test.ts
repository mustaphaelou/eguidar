import { randomUUID } from "node:crypto"

import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import { prisma } from "@/lib/db"
import {
  archiver,
  BlogSlugConflictError,
  BlogValidationError,
  createBrouillon,
  fetchArticleParSlug,
  fetchBlogLanding,
  lierProduits,
  mettreAJour,
  publier,
  SlugImmutableError,
  ThemeNotFoundError,
  type BlogEffects,
  type CreateBrouillonInput,
} from "@/lib/use-cases/blog"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

const runId = randomUUID().slice(0, 8)
const bSlug = (suffix: string) => `b-${runId}-${suffix}`
const cSlug = `b-${runId}-cat`

interface SeedVariant {
  name: string
  sku: string
  priceDelta: number
  stock: number
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
  const category = await prisma.category.findUniqueOrThrow({
    where: { slug: cSlug },
  })
  return prisma.product.create({
    data: {
      name: `Produit ${suffix}`,
      slug: bSlug(`prod-${suffix}`),
      description: "Description de test",
      brand: "Marque",
      categoryId: category.id,
      price: overrides.price ?? 100000,
      specs: {},
      images: overrides.images ?? [`https://example.com/${suffix}.jpg`],
      freeShipping: overrides.freeShipping ?? false,
      variants: {
        create:
          overrides.variants ??
          [{ name: "Standard", sku: `SKU-${runId}-${suffix}`, priceDelta: 0, stock: 5 }],
      },
    },
    include: { variants: true },
  })
}

function makeEffects(): BlogEffects & {
  revalidateBlog: ReturnType<typeof vi.fn>
  deleteImages: ReturnType<typeof vi.fn>
} {
  return {
    revalidateBlog: vi.fn(() => {}),
    deleteImages: vi.fn(async () => {}),
  }
}

function makeInput(
  overrides: Partial<CreateBrouillonInput> = {}
): CreateBrouillonInput {
  return {
    titre: "Guide de test",
    slug: bSlug("base"),
    extrait: "Un extrait de test",
    contenu: "Un contenu de test",
    themeSlug: "guides",
    ...overrides,
  }
}

describe("blog brouillon foundation", () => {
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
    await prisma.category.upsert({
      where: { slug: cSlug },
      update: {},
      create: { name: "Catégorie blog test", slug: cSlug },
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
    await prisma.category.deleteMany({ where: { slug: cSlug } })
    await prisma.$disconnect()
  })

  it("creates a brouillon with its theme and revalidates", async () => {
    const effects = makeEffects()
    const article = await createBrouillon(
      makeInput({ slug: bSlug("cree") }),
      effects
    )

    expect(article.id).toBeTruthy()
    expect(article.slug).toBe(bSlug("cree"))
    expect(article.statut).toBe("brouillon")
    expect(article.publishedAt).toBeNull()
    expect(article.theme.slug).toBe("guides")

    const persisted = await prisma.articleBlog.findUniqueOrThrow({
      where: { slug: bSlug("cree") },
      include: { theme: true },
    })
    expect(persisted.titre).toBe("Guide de test")
    expect(persisted.theme.nom).toBe("Guides")

    expect(effects.revalidateBlog).toHaveBeenCalledWith({
      id: article.id,
      slug: article.slug,
    })
    expect(effects.deleteImages).not.toHaveBeenCalled()
  })

  it("creates a brouillon via themeId with a couverture", async () => {
    const guides = await prisma.theme.findUniqueOrThrow({
      where: { slug: "guides" },
    })
    const article = await createBrouillon(
      makeInput({
        slug: bSlug("couverture"),
        themeSlug: undefined,
        themeId: guides.id,
        couverture: "https://example.com/cover.jpg",
      }),
      makeEffects()
    )

    expect(article.couverture).toBe("https://example.com/cover.jpg")
    expect(article.statut).toBe("brouillon")
  })

  it("rejects a duplicate slug with a conflict error", async () => {
    const effects = makeEffects()
    await createBrouillon(makeInput({ slug: bSlug("dup") }), effects)

    await expect(
      createBrouillon(
        makeInput({ slug: bSlug("dup"), titre: "Autre titre" }),
        makeEffects()
      )
    ).rejects.toThrow(BlogSlugConflictError)

    const count = await prisma.articleBlog.count({
      where: { slug: bSlug("dup") },
    })
    expect(count).toBe(1)
  })

  it("rejects an invalid slug and a missing theme", async () => {
    await expect(
      createBrouillon(makeInput({ slug: bSlug("MAJUSCULES") }), makeEffects())
    ).rejects.toThrow(BlogValidationError)

    await expect(
      createBrouillon(
        makeInput({ slug: bSlug("ni-theme"), themeSlug: undefined }),
        makeEffects()
      )
    ).rejects.toThrow(BlogValidationError)

    await expect(
      createBrouillon(
        makeInput({ slug: bSlug("theme-inconnu"), themeSlug: "inconnu" }),
        makeEffects()
      )
    ).rejects.toThrow(ThemeNotFoundError)
  })

  it("never resolves a brouillon publicly", async () => {
    await createBrouillon(
      makeInput({ slug: bSlug("invisible") }),
      makeEffects()
    )

    await expect(fetchArticleParSlug(bSlug("invisible"))).resolves.toBeNull()
  })

  it("returns null for an unknown slug", async () => {
    await expect(fetchArticleParSlug(bSlug("inexistant"))).resolves.toBeNull()
  })

  describe("publier + landing", () => {
    async function publierArticle(suffix: string) {
      const effets = makeEffects()
      const brouillon = await createBrouillon(
        makeInput({ slug: bSlug(suffix) }),
        effets
      )
      const publie = await publier(brouillon.id, effets)
      return { brouillon, publie, effets }
    }

    it("publishes a brouillon, stamps the publication date and revalidates", async () => {
      const { publie, effets } = await publierArticle("publie")

      expect(publie.statut).toBe("publie")
      expect(publie.publishedAt).toBeInstanceOf(Date)
      expect(effets.revalidateBlog).toHaveBeenCalledWith({
        id: publie.id,
        slug: bSlug("publie"),
      })

      const landing = await fetchBlogLanding()
      expect(landing.hero?.slug).toBe(bSlug("publie"))
      expect(landing.articles).toEqual([])

      await expect(fetchArticleParSlug(bSlug("publie"))).resolves.toMatchObject(
        { titre: "Guide de test" }
      )
    })

    it("keeps the first publication date when publishing twice", async () => {
      const { publie } = await publierArticle("idempotent")

      const republication = await publier(publie.id, makeEffects())

      expect(republication.statut).toBe("publie")
      expect(republication.publishedAt?.getTime()).toBe(
        publie.publishedAt?.getTime()
      )
    })

    it("re-publishes an archive keeping the original date", async () => {
      const { publie } = await publierArticle("republie")
      const firstDate = publie.publishedAt?.getTime()

      await prisma.articleBlog.update({
        where: { id: publie.id },
        data: { statut: "archive" },
      })
      await expect(fetchBlogLanding()).resolves.toEqual({
        hero: null,
        articles: [],
      })

      const republication = await publier(publie.id, makeEffects())

      expect(republication.statut).toBe("publie")
      expect(republication.publishedAt?.getTime()).toBe(firstDate)
    })

    it("throws a user-facing error for an unknown article", async () => {
      await expect(publier("inexistant", makeEffects())).rejects.toThrow(
        "Article de blog introuvable"
      )
      await expect(publier("inexistant", makeEffects())).rejects.toThrow(
        UserFacingError
      )
    })

    it("lists publie articles newest first with the hero split from the feed", async () => {
      const ancien = await publierArticle("ordre-ancien")
      const moyen = await publierArticle("ordre-moyen")
      const recent = await publierArticle("ordre-recent")

      await prisma.articleBlog.update({
        where: { id: ancien.publie.id },
        data: { publishedAt: new Date("2026-01-10T10:00:00Z") },
      })
      await prisma.articleBlog.update({
        where: { id: moyen.publie.id },
        data: { publishedAt: new Date("2026-02-10T10:00:00Z") },
      })
      await prisma.articleBlog.update({
        where: { id: recent.publie.id },
        data: { publishedAt: new Date("2026-03-10T10:00:00Z") },
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
      await createBrouillon(
        makeInput({ slug: bSlug("reste-brouillon") }),
        makeEffects()
      )
      await publierArticle("visible")

      const landing = await fetchBlogLanding()

      expect(landing.hero?.slug).toBe(bSlug("visible"))
      expect(landing.articles.map((article) => article.slug)).not.toContain(
        bSlug("reste-brouillon")
      )
    })

    it("returns an empty landing when nothing is publie", async () => {
      await expect(fetchBlogLanding()).resolves.toEqual({
        hero: null,
        articles: [],
      })
    })
  })

  describe("page Article de blog", () => {
    it("returns the full detail shape for a publie article", async () => {
      const effets = makeEffects()
      const brouillon = await createBrouillon(
        makeInput({
          slug: bSlug("detail"),
          titre: "Bien choisir son smartphone",
          extrait: "Nos conseils pour un achat serein.",
          couverture: "https://example.com/smartphone.jpg",
          contenu: "Premier paragraphe.\n\nDeuxième paragraphe.",
          themeSlug: "annonces",
        }),
        effets
      )
      await publier(brouillon.id, effets)

      const article = await fetchArticleParSlug(bSlug("detail"))

      expect(article).toMatchObject({
        titre: "Bien choisir son smartphone",
        slug: bSlug("detail"),
        extrait: "Nos conseils pour un achat serein.",
        couverture: "https://example.com/smartphone.jpg",
        contenu: "Premier paragraphe.\n\nDeuxième paragraphe.",
        theme: { slug: "annonces", nom: "Annonces" },
        statut: "publie",
        produits: [],
      })
      expect(article?.id).toBe(brouillon.id)
      expect(article?.publishedAt).toBeInstanceOf(Date)
    })

    it("returns null for an unknown slug", async () => {
      await expect(fetchArticleParSlug(bSlug("inexistant"))).resolves.toBeNull()
    })

    it("returns null for a brouillon slug", async () => {
      await createBrouillon(
        makeInput({ slug: bSlug("detail-brouillon") }),
        makeEffects()
      )

      await expect(
        fetchArticleParSlug(bSlug("detail-brouillon"))
      ).resolves.toBeNull()
    })
  })

  describe("retouches + archive", () => {
    async function publierArticle(suffix: string) {
      const effets = makeEffects()
      const brouillon = await createBrouillon(
        makeInput({ slug: bSlug(suffix) }),
        effets
      )
      const publie = await publier(brouillon.id, effets)
      return { brouillon, publie }
    }

    it("edits a brouillon in place, slug change allowed before publication", async () => {
      const effets = makeEffects()
      const brouillon = await createBrouillon(
        makeInput({ slug: bSlug("edit-brouillon") }),
        effets
      )

      const updated = await mettreAJour(
        brouillon.id,
        { titre: "Titre retouché", slug: bSlug("edit-brouillon-v2") },
        effets
      )

      expect(updated.titre).toBe("Titre retouché")
      expect(updated.slug).toBe(bSlug("edit-brouillon-v2"))
      expect(updated.statut).toBe("brouillon")
      expect(updated.publishedAt).toBeNull()
      expect(effets.revalidateBlog).toHaveBeenCalledWith({
        id: brouillon.id,
        slug: bSlug("edit-brouillon-v2"),
      })

      await expect(
        fetchArticleParSlug(bSlug("edit-brouillon-v2"))
      ).resolves.toBeNull()
    })

    it("edits a publie article without unpublishing", async () => {
      const { publie } = await publierArticle("edit-publie")
      const firstDate = publie.publishedAt?.getTime()
      const effets = makeEffects()

      const updated = await mettreAJour(
        publie.id,
        {
          titre: "Titre corrigé",
          extrait: "Extrait corrigé",
          contenu: "Contenu corrigé",
          themeSlug: "annonces",
        },
        effets
      )

      expect(updated.statut).toBe("publie")
      expect(updated.publishedAt?.getTime()).toBe(firstDate)
      expect(updated.titre).toBe("Titre corrigé")
      expect(effets.revalidateBlog).toHaveBeenCalledWith({
        id: publie.id,
        slug: bSlug("edit-publie"),
      })

      await expect(fetchArticleParSlug(bSlug("edit-publie"))).resolves.toMatchObject(
        { titre: "Titre corrigé", statut: "publie" }
      )
      const landing = await fetchBlogLanding()
      expect(landing.hero?.slug).toBe(bSlug("edit-publie"))
      expect(landing.hero?.titre).toBe("Titre corrigé")
    })

    it("rejects a slug change after publication", async () => {
      const { publie } = await publierArticle("slug-frozen")

      await expect(
        mettreAJour(publie.id, { slug: bSlug("nouveau-slug") }, makeEffects())
      ).rejects.toThrow(SlugImmutableError)
      await expect(
        mettreAJour(publie.id, { slug: bSlug("nouveau-slug") }, makeEffects())
      ).rejects.toThrow("Le slug est figé après publication")
      await expect(
        mettreAJour(publie.id, { slug: bSlug("nouveau-slug") }, makeEffects())
      ).rejects.toThrow(UserFacingError)

      const persisted = await prisma.articleBlog.findUniqueOrThrow({
        where: { id: publie.id },
      })
      expect(persisted.slug).toBe(bSlug("slug-frozen"))
    })

    it("excludes an archived article from the landing but keeps its URL resolving", async () => {
      const effets = makeEffects()
      const { publie } = await publierArticle("archive-visible")
      await publierArticle("archive-autre")

      const archive = await archiver(publie.id, effets)

      expect(archive.statut).toBe("archive")
      expect(effets.revalidateBlog).toHaveBeenCalledWith({
        id: publie.id,
        slug: bSlug("archive-visible"),
      })

      const landing = await fetchBlogLanding()
      expect(
        [landing.hero?.slug, ...landing.articles.map((a) => a.slug)]
      ).not.toContain(bSlug("archive-visible"))
      expect(landing.hero?.slug).toBe(bSlug("archive-autre"))

      await expect(
        fetchArticleParSlug(bSlug("archive-visible"))
      ).resolves.toMatchObject({
        titre: "Guide de test",
        slug: bSlug("archive-visible"),
        contenu: "Un contenu de test",
        statut: "archive",
      })
    })

    it("archives a brouillon and stays idempotent on a second archive", async () => {
      const brouillon = await createBrouillon(
        makeInput({ slug: bSlug("archive-brouillon") }),
        makeEffects()
      )

      const archive = await archiver(brouillon.id, makeEffects())
      expect(archive.statut).toBe("archive")
      expect(archive.publishedAt).toBeNull()

      const second = await archiver(brouillon.id, makeEffects())
      expect(second.statut).toBe("archive")

      await expect(fetchBlogLanding()).resolves.toEqual({
        hero: null,
        articles: [],
      })
      await expect(
        fetchArticleParSlug(bSlug("archive-brouillon"))
      ).resolves.toMatchObject({ statut: "archive" })
    })

    it("rejects edits on an archived article", async () => {
      const { publie } = await publierArticle("archive-fige")
      await archiver(publie.id, makeEffects())

      await expect(
        mettreAJour(publie.id, { titre: "Retouche tardive" }, makeEffects())
      ).rejects.toThrow("Un article archivé ne peut plus être modifié")
    })

    it("deletes the old cover best-effort on swap", async () => {
      const effets = makeEffects()
      const brouillon = await createBrouillon(
        makeInput({
          slug: bSlug("cover-swap"),
          couverture: "https://example.com/ancienne.jpg",
        }),
        effets
      )
      const publie = await publier(brouillon.id, effets)

      const updated = await mettreAJour(
        publie.id,
        { couverture: "https://example.com/nouvelle.jpg" },
        effets
      )

      expect(updated.couverture).toBe("https://example.com/nouvelle.jpg")
      expect(effets.deleteImages).toHaveBeenCalledWith([
        "https://example.com/ancienne.jpg",
      ])
    })

    it("still succeeds when the cover delete fails", async () => {
      const { publie } = await publierArticle("cover-echec")
      await prisma.articleBlog.update({
        where: { id: publie.id },
        data: { couverture: "https://example.com/ancienne.jpg" },
      })
      const effets = makeEffects()
      effets.deleteImages.mockRejectedValueOnce(new Error("R2 indisponible"))

      const updated = await mettreAJour(
        publie.id,
        { couverture: "https://example.com/nouvelle.jpg" },
        effets
      )

      expect(updated.couverture).toBe("https://example.com/nouvelle.jpg")
      expect(updated.statut).toBe("publie")
    })

    it("throws a user-facing error for an unknown article", async () => {
      await expect(
        mettreAJour("inexistant", { titre: "X" }, makeEffects())
      ).rejects.toThrow("Article de blog introuvable")
      await expect(archiver("inexistant", makeEffects())).rejects.toThrow(
        "Article de blog introuvable"
      )
    })
  })

  describe("produits liés", () => {
    async function publierArticleAvecLien(suffix: string) {
      const effets = makeEffects()
      const brouillon = await createBrouillon(
        makeInput({ slug: bSlug(suffix) }),
        effets
      )
      const publie = await publier(brouillon.id, effets)
      return { brouillon, publie }
    }

    it("attaches 0..n produits en préservant l'ordre et remplace à chaque appel", async () => {
      const { publie } = await publierArticleAvecLien("lies-ordre")
      const p1 = await createProduit("ordre-1")
      const p2 = await createProduit("ordre-2")
      const p3 = await createProduit("ordre-3")

      const effets = makeEffects()
      const resultat = await lierProduits(
        publie.id,
        [p3.id, p1.id, p2.id],
        effets
      )

      expect(resultat).toEqual({
        articleId: publie.id,
        productIds: [p3.id, p1.id, p2.id],
      })
      expect(effets.revalidateBlog).toHaveBeenCalledWith({
        id: publie.id,
        slug: bSlug("lies-ordre"),
      })
      expect(effets.deleteImages).not.toHaveBeenCalled()

      const rows = await prisma.articleBlogProduit.findMany({
        where: { articleId: publie.id },
        orderBy: { ordre: "asc" },
      })
      expect(rows.map((row) => row.productId)).toEqual([p3.id, p1.id, p2.id])
      expect(rows.map((row) => row.ordre)).toEqual([0, 1, 2])

      const article = await fetchArticleParSlug(bSlug("lies-ordre"))
      expect(article?.produits.map((produit) => produit.slug)).toEqual([
        p3.slug,
        p1.slug,
        p2.slug,
      ])

      await lierProduits(publie.id, [p2.id], makeEffects())
      const remplace = await fetchArticleParSlug(bSlug("lies-ordre"))
      expect(remplace?.produits.map((produit) => produit.slug)).toEqual([
        p2.slug,
      ])

      await lierProduits(publie.id, [], makeEffects())
      const vide = await fetchArticleParSlug(bSlug("lies-ordre"))
      expect(vide?.statut).toBe("publie")
      expect(vide?.produits).toEqual([])
    })

    it("expose des cartes catalogue avec minPrice calculé (ADR-0013)", async () => {
      const { publie } = await publierArticleAvecLien("lies-prix")
      const produit = await createProduit("prix", {
        price: 100000,
        freeShipping: true,
        images: ["https://example.com/prix.jpg"],
        variants: [
          { name: "Base", sku: `SKU-${runId}-prix-base`, priceDelta: 0, stock: 5 },
          { name: "Remise", sku: `SKU-${runId}-prix-remise`, priceDelta: -20000, stock: 3 },
          { name: "Premium", sku: `SKU-${runId}-prix-prem`, priceDelta: 10000, stock: 2 },
        ],
      })

      await lierProduits(publie.id, [produit.id], makeEffects())

      const article = await fetchArticleParSlug(bSlug("lies-prix"))

      expect(article?.produits).toHaveLength(1)
      expect(article?.produits[0]).toMatchObject({
        id: produit.id,
        slug: produit.slug,
        brand: "Marque",
        image: "https://example.com/prix.jpg",
        minPrice: 80000,
        totalStock: 10,
        freeShipping: true,
      })
    })

    it("déduplique en préservant le premier ordre et rejette les inconnus", async () => {
      const { publie } = await publierArticleAvecLien("lies-dedupe")
      const p1 = await createProduit("dedupe-1")
      const p2 = await createProduit("dedupe-2")

      await lierProduits(publie.id, [p1.id, p1.id, p2.id, p1.id], makeEffects())

      const article = await fetchArticleParSlug(bSlug("lies-dedupe"))
      expect(article?.produits.map((produit) => produit.slug)).toEqual([
        p1.slug,
        p2.slug,
      ])

      await expect(
        lierProduits(publie.id, [p1.id, "produit-inexistant"], makeEffects())
      ).rejects.toThrow(UserFacingError)

      const inchange = await fetchArticleParSlug(bSlug("lies-dedupe"))
      expect(inchange?.produits.map((produit) => produit.slug)).toEqual([
        p1.slug,
        p2.slug,
      ])
    })

    it("rejette un article inconnu sans rien écrire", async () => {
      const produit = await createProduit("inconnu")

      await expect(
        lierProduits("article-inexistant", [produit.id], makeEffects())
      ).rejects.toThrow("Article de blog introuvable")

      const liens = await prisma.articleBlogProduit.count({
        where: { productId: produit.id },
      })
      expect(liens).toBe(0)
    })

    it("masque un produit supprimé, l'article reste en ligne", async () => {
      const { publie } = await publierArticleAvecLien("lies-supprime")
      const garde = await createProduit("garde")
      const supprime = await createProduit("supprime")

      await lierProduits(publie.id, [garde.id, supprime.id], makeEffects())
      await prisma.product.delete({ where: { id: supprime.id } })

      const article = await fetchArticleParSlug(bSlug("lies-supprime"))

      expect(article?.statut).toBe("publie")
      expect(article?.produits.map((produit) => produit.slug)).toEqual([
        garde.slug,
      ])
    })

    it("masque un produit en rupture (totalStock === 0), l'article reste en ligne", async () => {
      const { publie } = await publierArticleAvecLien("lies-rupture")
      const disponible = await createProduit("dispo")
      const rupture = await createProduit("rupture", {
        variants: [
          { name: "Standard", sku: `SKU-${runId}-rupture`, priceDelta: 0, stock: 0 },
        ],
      })

      await lierProduits(
        publie.id,
        [disponible.id, rupture.id],
        makeEffects()
      )

      const article = await fetchArticleParSlug(bSlug("lies-rupture"))

      expect(article?.statut).toBe("publie")
      expect(article?.produits.map((produit) => produit.slug)).toEqual([
        disponible.slug,
      ])
    })
  })
})
