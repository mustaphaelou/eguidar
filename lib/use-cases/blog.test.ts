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
  BlogSlugConflictError,
  BlogValidationError,
  createBrouillon,
  fetchArticleParSlug,
  ThemeNotFoundError,
  type BlogEffects,
  type CreateBrouillonInput,
} from "@/lib/use-cases/blog"

const runId = randomUUID().slice(0, 8)
const bSlug = (suffix: string) => `b-${runId}-${suffix}`

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
  })

  beforeEach(async () => {
    await prisma.articleBlogProduit.deleteMany({
      where: { article: { slug: { startsWith: `b-${runId}-` } } },
    })
    await prisma.articleBlog.deleteMany({
      where: { slug: { startsWith: `b-${runId}-` } },
    })
  })

  afterAll(async () => {
    await prisma.articleBlogProduit.deleteMany({
      where: { article: { slug: { startsWith: `b-${runId}-` } } },
    })
    await prisma.articleBlog.deleteMany({
      where: { slug: { startsWith: `b-${runId}-` } },
    })
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
})
