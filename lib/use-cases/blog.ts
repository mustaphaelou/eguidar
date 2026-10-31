import { cacheLife, cacheTag } from "next/cache"

import { filtreArticlePublic } from "@/lib/article-public"
import { projeterCarteProduit, type CarteProduit } from "@/lib/carte-produit"
import { prisma } from "@/lib/db"
import type { Prisma } from "@/lib/generated/prisma/client"
import {
  parametresDeSlug,
  type ParametresDeSlug,
} from "@/lib/parametre-de-repli"
import { minVariantPrice, totalVariantStock } from "@/lib/product-metrics"
import { BLOG_TAG, blogDetailTag } from "@/lib/use-cases/cache-invalidation"

export { filtreArticlePublic } from "@/lib/article-public"

export type StatutPublication = "brouillon" | "publie" | "archive"

export interface ThemeRef {
  slug: string
  nom: string
}

export interface ProduitLie extends CarteProduit {
  varianteId: string | null
}

export interface ArticleBlogPublic {
  id: string
  titre: string
  slug: string
  extrait: string
  chapo: string | null
  couverture: string | null
  contenu: string
  notes: string | null
  theme: ThemeRef
  publishedAt: Date | null
  statut: StatutPublication
  produits: ProduitLie[]
}

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

export async function fetchArticleParSlug(
  slug: string
): Promise<ArticleBlogPublic | null> {
  const article = await prisma.articleBlog.findFirst({
    where: { slug, ...filtreArticlePublic(["publie", "archive"]) },
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
  if (!article) return null
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
    chapo: article.chapo,
    couverture: article.couverture,
    contenu: article.contenu,
    notes: article.notes,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt,
    statut: article.statut,
    produits,
  }
}

export interface ArticleBlogResume {
  slug: string
  titre: string
  couverture: string | null
  theme: ThemeRef
  publishedAt: Date
}

export interface CardBlog extends ArticleBlogResume {
  extrait: string
}

export type ArticleLie = ArticleBlogResume

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
  if (!article.publishedAt) return null
  return {
    slug: article.slug,
    titre: article.titre,
    extrait: article.extrait,
    couverture: article.couverture,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt,
  }
}

export async function fetchBlogLanding(): Promise<BlogLanding> {
  const articles = await prisma.articleBlog.findMany({
    where: filtreArticlePublic(),
    include: { theme: true },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
  })
  const cartes = articles
    .map(toCardBlog)
    .filter((carte): carte is CardBlog => carte !== null)
  const [hero, ...rest] = cartes
  return { hero: hero ?? null, articles: rest }
}

function toArticleLie(article: {
  slug: string
  titre: string
  couverture: string | null
  publishedAt: Date | null
  theme: ThemeRef
}): ArticleLie | null {
  if (!article.publishedAt) return null
  return {
    slug: article.slug,
    titre: article.titre,
    couverture: article.couverture,
    theme: { slug: article.theme.slug, nom: article.theme.nom },
    publishedAt: article.publishedAt,
  }
}

const LIMITE_ARTICLES_LIES = 3

const INCLUSION_DU_THEME: Prisma.ArticleBlogInclude = { theme: true }

const TRI_DE_PUBLICATION: Prisma.ArticleBlogOrderByWithRelationInput[] = [
  { publishedAt: "desc" },
  { createdAt: "desc" },
]

export async function fetchArticlesLies(
  slug: string,
  themeSlug: string
): Promise<ArticleLie[]> {
  const publies = {
    statut: "publie" as const,
    slug: { not: slug },
    publishedAt: { not: null },
  }
  const memes = await prisma.articleBlog.findMany({
    where: { ...publies, theme: { is: { slug: themeSlug } } },
    include: INCLUSION_DU_THEME,
    orderBy: TRI_DE_PUBLICATION,
    take: LIMITE_ARTICLES_LIES,
  })
  const restant = LIMITE_ARTICLES_LIES - memes.length
  const autres =
    restant > 0
      ? await prisma.articleBlog.findMany({
          where: { ...publies, theme: { isNot: { slug: themeSlug } } },
          include: INCLUSION_DU_THEME,
          orderBy: TRI_DE_PUBLICATION,
          take: restant,
        })
      : []
  return [...memes, ...autres]
    .map(toArticleLie)
    .filter((article): article is ArticleLie => article !== null)
}

/**
 * Les slugs d'Articles que le build prérend : ceux dont l'URL résout encore,
 * c'est-à-dire les Publiés et les Archivés (un Brouillon n'a pas d'URL
 * publique). Triés pour que deux builds produisent la même liste.
 */
export async function fetchArticleSlugs(): Promise<string[]> {
  const articles = await prisma.articleBlog.findMany({
    where: filtreArticlePublic(["publie", "archive"]),
    select: { slug: true },
    orderBy: { slug: "asc" },
  })
  return articles.map((article) => article.slug)
}

export async function parametresDesArticles(): Promise<ParametresDeSlug[]> {
  return parametresDeSlug(await fetchArticleSlugs())
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

export async function getArticlesLies(
  slug: string,
  themeSlug: string
): Promise<ArticleLie[]> {
  "use cache: remote"
  cacheTag(BLOG_TAG, blogDetailTag(slug))
  cacheLife(BLOG_CACHE_LIFE)
  return fetchArticlesLies(slug, themeSlug)
}
