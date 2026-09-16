import { cacheLife, cacheTag } from "next/cache"
import { z } from "zod"

import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import { minVariantPrice, totalVariantStock } from "@/lib/product-metrics"
import {
  BLOG_TAG,
  blogDetailTag,
  type BlogEventArticle,
} from "@/lib/use-cases/cache-invalidation"
import { hasUniqueViolation } from "@/lib/use-cases/unique-violation"
import { UserFacingError } from "@/lib/use-cases/user-facing-error"

export type StatutPublication = "brouillon" | "publie" | "archive"

export interface ThemeRef {
  slug: string
  nom: string
}

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
  // Choix d'implémentation : themeSlug ou themeId (XOR) pour le 0..n côté admin.
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

async function resolveTheme(themeSlug?: string, themeId?: string) {
  const theme = themeId
    ? await prisma.theme.findUnique({ where: { id: themeId } })
    : await prisma.theme.findUnique({ where: { slug: themeSlug! } })
  if (!theme) throw new ThemeNotFoundError()
  return theme
}

export async function createBrouillon(
  input: CreateBrouillonInput,
  effects: BlogEffects
) {
  const data = parseCreateBrouillonInput(input)

  const theme = await resolveTheme(data.themeSlug, data.themeId)

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
 * Publie un Article de blog (Brouillon → Publié uniquement).
 * Tamponne publishedAt à la première publication puis la conserve
 * (re-publication Publié → Publié idempotente). Un Archivé refuse
 * la re-publication (UserFacingError — spec : publier = Brouillon,
 * archiver = Publié).
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

  if (article.statut === "archive") {
    throw new UserFacingError("Un article archivé ne peut plus être publié")
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
    const theme = await resolveTheme(data.themeSlug, data.themeId)
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

  const previousSlug = updated.slug !== article.slug ? article.slug : undefined
  effects.revalidateBlog?.({
    id: updated.id,
    slug: updated.slug,
    ...(previousSlug ? { previousSlug } : {}),
  })
  return updated
}

/**
 * Archive un Article de blog (Publié → Archivé uniquement).
 * Archivé → Archivé idempotent (comme `publier`). Un Brouillon refuse
 * l'archivage (UserFacingError — spec : archiver = Publié).
 * `publishedAt` est conservé tel quel, donc un Archivé a toujours sa date.
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

  if (article.statut === "brouillon") {
    throw new UserFacingError("Seul un article publié peut être archivé")
  }

  const updated = await prisma.articleBlog.update({
    where: { id },
    data: { statut: "archive" },
    include: { theme: true },
  })

  effects.revalidateBlog?.({ id: updated.id, slug: updated.slug })
  return updated
}

export interface ProduitLie extends CarteProduit {
  /** Première variante disponible (stock > 0), pour l'ajout au panier. */
  varianteId: string | null
}

export interface ArticleBlogPublic {
  id: string
  titre: string
  slug: string
  extrait: string
  couverture: string | null
  contenu: string
  theme: ThemeRef
  publishedAt: Date | null
  statut: StatutPublication
  /**
   * Produits liés de l'Article de blog, en cartes catalogue (#164).
   * Ordre d'attachement préservé (ordre croissant), indisponibles masqués
   * à la lecture (produit supprimé ou stock total nul) — `[]` possible,
   * l'article reste Publié dans tous les cas.
   */
  produits: ProduitLie[]
}

/**
 * Carte produit d'un Produit lié : la projection (`@/lib/carte-produit`)
 * sur les métriques cuites par `@/lib/product-metrics`, enrichie de la
 * première variante disponible. Masque la rupture (#164) : la Carte
 * produit disparaît, l'Article de blog reste publié.
 */
function toProduitLieCard(product: {
  id: string
  name: string
  slug: string
  brand: string
  images: unknown
  price: number
  freeShipping: boolean
  variants: { id: string; priceDelta: number; stock: number }[]
}): ProduitLie | null {
  const carte = projeterCarteProduit(
    {
      id: product.id,
      name: product.name,
      slug: product.slug,
      brand: product.brand,
      images: product.images,
      minPrice: minVariantPrice(product.price, product.variants),
      totalStock: totalVariantStock(product.variants),
      freeShipping: product.freeShipping,
    },
    { rupture: "masquer" }
  )
  if (!carte) return null
  const disponible = product.variants.find((v) => v.stock > 0)
  return { ...carte, varianteId: disponible?.id ?? null }
}

/**
 * Attache 0..n Produits liés à un Article de blog (sémantique de
 * remplacement, ordre préservé via `ordre`, `[]` autorisé pour tout
 * détacher). Déduplique en préservant le premier ordre d'apparition.
 * Rejette les identifiants inconnus (UserFacingError) sans rien écrire.
 * Ne touche jamais aux médias (best-effort delete = #163 `mettreAJour`).
 * Choix d'implémentation : remplacement atomique + ordre + dédupe pour le 0..n.
 */
export async function lierProduits(
  articleId: string,
  productIds: string[],
  effects: BlogEffects
) {
  const article = await prisma.articleBlog.findUnique({
    where: { id: articleId },
  })
  if (!article) throw new UserFacingError("Article de blog introuvable")

  const deduped = [...new Set(productIds)]

  if (deduped.length > 0) {
    const existing = await prisma.product.findMany({
      where: { id: { in: deduped } },
      select: { id: true },
    })
    if (existing.length !== deduped.length) {
      throw new UserFacingError("Produit lié introuvable")
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.articleBlogProduit.deleteMany({ where: { articleId } })
    if (deduped.length > 0) {
      await tx.articleBlogProduit.createMany({
        data: deduped.map((productId, ordre) => ({
          articleId,
          productId,
          ordre,
        })),
      })
    }
  })

  effects.revalidateBlog?.({ id: article.id, slug: article.slug })
  return { articleId: article.id, productIds: deduped }
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
    include: {
      theme: true,
      produits: {
        orderBy: { ordre: "asc" },
        include: {
          produit: {
            include: {
              variants: {
                select: { id: true, priceDelta: true, stock: true },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      },
    },
  })
  if (!article || (article.statut !== "publie" && article.statut !== "archive"))
    return null
  const produits: ProduitLie[] = []
  for (const lien of article.produits) {
    const produit = lien.produit
    if (!produit) continue
    const carte = toProduitLieCard(produit)
    if (carte) produits.push(carte)
  }
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
    produits,
  }
}

export interface CardBlog {
  slug: string
  titre: string
  extrait: string
  couverture: string | null
  theme: ThemeRef
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
  theme: ThemeRef
}): CardBlog | null {
  if (!article.publishedAt) {
    console.warn(`[blog] article publié sans date ignoré : ${article.slug}`)
    return null
  }
  return {
    slug: article.slug,
    titre: article.titre,
    extrait: article.extrait,
    couverture: article.couverture,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt,
  }
}

/**
 * Données de la landing /blog : hero = l'Article de blog Publié le plus
 * récent, articles = la suite du fil. Publié uniquement, plus récent d'abord
 * (publishedAt desc, createdAt desc en départage).
 */
export async function fetchBlogLanding(): Promise<BlogLanding> {
  const articles = await prisma.articleBlog.findMany({
    where: { statut: "publie" },
    include: { theme: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  })
  const cartes = articles
    .map(toCardBlog)
    .filter((carte): carte is CardBlog => carte !== null)
  const [hero, ...rest] = cartes
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
