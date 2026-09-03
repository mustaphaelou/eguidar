import { cacheLife, cacheTag } from "next/cache"
import { z } from "zod"

import { prisma } from "@/lib/db"
import {
  BLOG_TAG,
  blogDetailTag,
  type BlogEventArticle,
} from "@/lib/use-cases/cache-invalidation"
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

export class SlugImmutableError extends UserFacingError {
  constructor() {
    super("Le slug est figé après publication")
    this.name = "SlugImmutableError"
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

async function assertUniqueArticleSlug(
  slug: string,
  excludeId?: string
): Promise<void> {
  const existing = await prisma.articleBlog.findUnique({ where: { slug } })
  if (existing && existing.id !== excludeId) throw new BlogSlugConflictError()
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

/**
 * Publie un Article de blog (Brouillon → Publié, ou Archivé → Publié).
 * Tamponne publishedAt à la première publication puis la conserve
 * (re-publication idempotente et re-publication après archive).
 */
export async function publier(id: string, effects: BlogEffects) {
  const article = await prisma.articleBlog.findUnique({
    where: { id },
    include: { theme: true },
  })
  if (!article) throw new UserFacingError("Article de blog introuvable")

  if (article.statut === "publie") {
    effects.revalidateBlog?.({ id: article.id, slug: article.slug })
    return article
  }

  const updated = await prisma.articleBlog.update({
    where: { id },
    data: {
      statut: "publie",
      publishedAt: article.publishedAt ?? new Date(),
    },
    include: { theme: true },
  })

  effects.revalidateBlog?.({ id: updated.id, slug: updated.slug })
  return updated
}

export interface MettreAJourInput {
  titre?: string
  slug?: string
  extrait?: string
  couverture?: string | null
  contenu?: string
  themeSlug?: string
  themeId?: string
}

const mettreAJourSchema = z.object({
  titre: z.string().trim().min(1, "titre requis").optional(),
  slug: slugSchema.optional(),
  extrait: z.string().trim().min(1, "extrait requis").optional(),
  couverture: z.string().nullable().optional(),
  contenu: z.string().trim().min(1, "contenu requis").optional(),
  themeSlug: z.string().min(1).optional(),
  themeId: z.string().min(1).optional(),
})

/**
 * Retouches d'un Article de blog (Brouillon ou Publié, sans dépublication).
 * Choix #163 : un article Archivé refuse toute retouche (UserFacingError —
 * l'archive est terminale pour les edits ; republier via `publier` d'abord).
 * Le slug est figé dès la première publication (`publishedAt != null`),
 * y compris après archive (SlugImmutableError).
 */
export async function mettreAJour(
  id: string,
  patch: MettreAJourInput,
  effects: BlogEffects
) {
  const result = mettreAJourSchema.safeParse(patch)
  if (!result.success) {
    throw new BlogValidationError(
      result.error.issues.map((issue) => issue.message)
    )
  }
  const data = result.data
  if (data.themeSlug !== undefined && data.themeId !== undefined) {
    throw new BlogValidationError(["thème requis (themeSlug ou themeId)"])
  }

  const article = await prisma.articleBlog.findUnique({
    where: { id },
    include: { theme: true },
  })
  if (!article) throw new UserFacingError("Article de blog introuvable")
  if (article.statut === "archive") {
    throw new UserFacingError("Un article archivé ne peut plus être modifié")
  }

  if (
    data.slug !== undefined &&
    data.slug !== article.slug &&
    article.publishedAt !== null
  ) {
    throw new SlugImmutableError()
  }

  let themeId: string | undefined
  if (data.themeSlug !== undefined || data.themeId !== undefined) {
    const theme = data.themeId
      ? await prisma.theme.findUnique({ where: { id: data.themeId } })
      : await prisma.theme.findUnique({ where: { slug: data.themeSlug! } })
    if (!theme) throw new ThemeNotFoundError()
    themeId = theme.id
  }

  if (data.slug !== undefined && data.slug !== article.slug) {
    await assertUniqueArticleSlug(data.slug, id)
  }

  const removedImages =
    data.couverture !== undefined &&
    article.couverture !== null &&
    article.couverture !== data.couverture
      ? [article.couverture]
      : []

  let updated
  try {
    updated = await prisma.articleBlog.update({
      where: { id },
      data: {
        ...(data.titre !== undefined ? { titre: data.titre } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.extrait !== undefined ? { extrait: data.extrait } : {}),
        ...(data.couverture !== undefined
          ? { couverture: data.couverture }
          : {}),
        ...(data.contenu !== undefined ? { contenu: data.contenu } : {}),
        ...(themeId !== undefined ? { themeId } : {}),
      },
      include: { theme: true },
    })
  } catch (error) {
    mapBlogUniqueViolation(error)
  }

  try {
    await effects.deleteImages(removedImages)
  } catch {
    // Best-effort : un échec de suppression R2 ne doit pas bloquer la mutation.
  }

  effects.revalidateBlog?.({ id: updated.id, slug: updated.slug })
  return updated
}

/**
 * Archive un Article de blog (Publié → Archivé).
 * Choix #163 : Brouillon → Archivé autorisé (mise au rebut sans publier) ;
 * Archivé → Archivé idempotent (comme `publier`).
 * `publishedAt` est conservé tel quel (première date gardée).
 */
export async function archiver(id: string, effects: BlogEffects) {
  const article = await prisma.articleBlog.findUnique({
    where: { id },
    include: { theme: true },
  })
  if (!article) throw new UserFacingError("Article de blog introuvable")

  if (article.statut === "archive") {
    effects.revalidateBlog?.({ id: article.id, slug: article.slug })
    return article
  }

  const updated = await prisma.articleBlog.update({
    where: { id },
    data: { statut: "archive" },
    include: { theme: true },
  })

  effects.revalidateBlog?.({ id: updated.id, slug: updated.slug })
  return updated
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
  statut: string
  /**
   * Produits liés de l'Article de blog — vide pour l'instant (#162).
   * Rempli en #164 (attachement + cartes Produit lié).
   */
  produits: []
}

/**
 * Résolution publique d'un Article de blog par son slug.
 * Publié + Archivé résolvent (l'Archivé garde son URL avec contenu complet) ;
 * un Brouillon n'est jamais résolu publiquement (retourne null).
 */
export async function fetchArticleParSlug(
  slug: string
): Promise<ArticleBlogPublic | null> {
  const article = await prisma.articleBlog.findUnique({
    where: { slug },
    include: { theme: true },
  })
  if (!article || (article.statut !== "publie" && article.statut !== "archive"))
    return null
  return {
    id: article.id,
    titre: article.titre,
    slug: article.slug,
    extrait: article.extrait,
    couverture: article.couverture,
    contenu: article.contenu,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt,
    statut: article.statut,
    produits: [],
  }
}

export interface CardBlog {
  slug: string
  titre: string
  extrait: string
  couverture: string | null
  theme: { slug: string; nom: string }
  publishedAt: Date
}

export interface BlogLanding {
  hero: CardBlog | null
  articles: CardBlog[]
}

function toCardBlog(article: {
  slug: string
  titre: string
  extrait: string
  couverture: string | null
  publishedAt: Date | null
  createdAt: Date
  theme: { slug: string; nom: string }
}): CardBlog {
  return {
    slug: article.slug,
    titre: article.titre,
    extrait: article.extrait,
    couverture: article.couverture,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt ?? article.createdAt,
  }
}

/**
 * Données de la landing /blog : hero = l'Article de blog Publié le plus
 * récent, articles = la suite du fil. Publié uniquement, plus récent d'abord.
 */
export async function fetchBlogLanding(): Promise<BlogLanding> {
  const articles = await prisma.articleBlog.findMany({
    where: { statut: "publie" },
    include: { theme: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  })
  const [hero, ...rest] = articles.map(toCardBlog)
  return { hero: hero ?? null, articles: rest }
}

const BLOG_CACHE_LIFE = { revalidate: 900, expire: 86400 }

export async function getBlogLanding(): Promise<BlogLanding> {
  "use cache: remote"
  cacheTag(BLOG_TAG)
  cacheLife(BLOG_CACHE_LIFE)
  return fetchBlogLanding()
}

export async function getArticleParSlug(
  slug: string
): Promise<ArticleBlogPublic | null> {
  "use cache: remote"
  cacheTag(BLOG_TAG, blogDetailTag(slug))
  cacheLife(BLOG_CACHE_LIFE)
  return fetchArticleParSlug(slug)
}
