import type { MetadataRoute } from "next"

import { urlProduit } from "@/lib/carte-produit"
import { site, staticPages } from "@/lib/site"
import { fetchArticleSlugs } from "@/lib/use-cases/blog"
import {
  fetchCategorySlugs,
  fetchProductSlugs,
} from "@/lib/use-cases/storefront"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [produits, categories, articles] = await Promise.all([
    fetchProductSlugs(),
    fetchCategorySlugs(),
    fetchArticleSlugs(),
  ])

  return [
    {
      url: site.url,
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${site.url}/produits`,
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...staticPages.map(({ href }) => ({
      url: `${site.url}${href}`,
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    ...categories.map((slug) => ({
      url: `${site.url}/categorie/${slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    ...produits.map((slug) => ({
      url: `${site.url}${urlProduit(slug)}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...articles.map((slug) => ({
      url: `${site.url}/blog/${slug}`,
      changeFrequency: "monthly" as const,
      priority: 0.6,
    })),
  ]
}
