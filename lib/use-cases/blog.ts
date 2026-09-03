import { z } from "zod"

import { prisma } from "@/lib/db"
import type { BlogEventArticle } from "@/lib/use-cases/cache-invalidation"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export interface CreateBrouillonInput {
  titre: string
  slug: string
  extrait: string
  couverture?: string
  contenu: string
  themeSlug?: string
  themeId?: string
}

export interface BlogEffects {
  revalidateBlog?(article: BlogEventArticle): void
  /**
   * Supprime les images de couverture données, une par une, en best-effort.
   * Invariant : ne rejette jamais — un échec de suppression R2 ne doit pas
   * faire échouer la mutation (ADR-0004).
   */
  deleteImages(urls: string[]): Promise<void>
}

export class BlogValidationError extends UserFacingError {
  constructor(issues: string[]) {
    super(`Données invalides : ${issues.join(" ; ")}`)
    this.name = "BlogValidationError"
  }
}

export class BlogSlugConflictError extends UserFacingError {
  constructor() {
    super("Un article avec ce slug existe déjà")
    this.name = "BlogSlugConflictError"
  }
}

export class ThemeNotFoundError extends Error {
  constructor() {
    super("Thème introuvable")
    this.name = "ThemeNotFoundError"
  }
}

const slugSchema = z
  .string()
  .min(1, "slug requis")
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    "slug invalide (minuscules, chiffres et tirets uniquement)"
  )

const createBrouillonSchema = z.object({
  titre: z.string().trim().min(1, "titre requis"),
  slug: slugSchema,
  extrait: z.string().trim().min(1, "extrait requis"),
  couverture: z.string().optional(),
  contenu: z.string().trim().min(1, "contenu requis"),
  themeSlug: z.string().min(1).optional(),
  themeId: z.string().min(1).optional(),
})

function parseCreateBrouillonInput(
  input: CreateBrouillonInput
): CreateBrouillonInput {
  const result = createBrouillonSchema.safeParse(input)
  if (!result.success) {
    throw new BlogValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  const hasThemeSlug = !!result.data.themeSlug
  const hasThemeId = !!result.data.themeId
  if (hasThemeSlug === hasThemeId) {
    throw new BlogValidationError(["thème requis (themeSlug ou themeId)"])
  }
  return result.data
}

async function assertUniqueArticleSlug(slug: string): Promise<void> {
  const existing = await prisma.articleBlog.findUnique({ where: { slug } })
  if (existing) throw new BlogSlugConflictError()
}

function mapBlogUniqueViolation(error: unknown): never {
  if (hasUniqueViolation(error, ["slug"])) throw new BlogSlugConflictError()
  throw error
}

export async function createBrouillon(
  input: CreateBrouillonInput,
  effects: BlogEffects
) {
  const data = parseCreateBrouillonInput(input)

  const theme = data.themeId
    ? await prisma.theme.findUnique({ where: { id: data.themeId } })
    : await prisma.theme.findUnique({ where: { slug: data.themeSlug! } })
  if (!theme) throw new ThemeNotFoundError()

  await assertUniqueArticleSlug(data.slug)

  let article
  try {
    article = await prisma.articleBlog.create({
      data: {
        titre: data.titre,
        slug: data.slug,
        extrait: data.extrait,
        couverture: data.couverture ?? null,
        contenu: data.contenu,
        themeId: theme.id,
        statut: "brouillon",
        publishedAt: null,
      },
      include: { theme: true },
    })
  } catch (error) {
    mapBlogUniqueViolation(error)
  }

  effects.revalidateBlog?.({ id: article.id, slug: article.slug })
  return article
}

export interface ArticleBlogPublic {
  id: string
  titre: string
  slug: string
  extrait: string
  couverture: string | null
  contenu: string
  theme: { slug: string; nom: string }
  publishedAt: Date | null
}

/**
 * Résolution publique d'un Article de blog par son slug.
 * Un Brouillon n'est jamais résolu publiquement (retourne null).
 */
export async function fetchArticleParSlug(
  slug: string
): Promise<ArticleBlogPublic | null> {
  const article = await prisma.articleBlog.findUnique({
    where: { slug },
    include: { theme: true },
  })
  if (!article || article.statut !== "publie") return null
  return {
    id: article.id,
    titre: article.titre,
    slug: article.slug,
    extrait: article.extrait,
    couverture: article.couverture,
    contenu: article.contenu,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt,
  }
}
