import { revalidatePath, revalidateTag } from "next/cache"

import { urlProduit } from "@/lib/carte-produit"
import type { DemandePurge, PortPurgeEdge } from "@/lib/purge-edge"
import { creerPurgeEdgeCloudflare } from "@/lib/purge-edge-cloudflare"
import { urlEdge } from "@/lib/zone-edge"

export const PRODUCT_TAG = "products"
export const HOME_TAG = "home"
export const CATEGORY_TAG = "categories"
export const BLOG_TAG = "blog"

const PREFIXE_DETAIL_PRODUIT = "product:"
const PREFIXE_DETAIL_CATEGORIE = "category:"

export const productDetailTag = (slug: string) =>
  `${PREFIXE_DETAIL_PRODUIT}${slug}`
export const categoryDetailTag = (slug: string) =>
  `${PREFIXE_DETAIL_CATEGORIE}${slug}`
export const blogDetailTag = (slug: string) => `blog:${slug}`

export interface CatalogueEventCategory {
  slug: string
}

export interface CatalogueEventProduct {
  id: string
  slug: string
  previousSlug?: string
  categoryChain: readonly CatalogueEventCategory[]
  previousCategoryChain?: readonly CatalogueEventCategory[]
}

export function tagsCatalogue(product: CatalogueEventProduct): string[] {
  const tags = [PRODUCT_TAG, productDetailTag(product.slug)]
  if (product.previousSlug && product.previousSlug !== product.slug) {
    tags.push(productDetailTag(product.previousSlug))
  }
  tags.push(HOME_TAG)
  const structuresNommees = new Set<string>()
  for (const structure of [
    ...product.categoryChain,
    ...(product.previousCategoryChain ?? []),
  ]) {
    if (structuresNommees.has(structure.slug)) continue
    structuresNommees.add(structure.slug)
    tags.push(categoryDetailTag(structure.slug))
  }
  return tags
}

export function tagsStructure(): string[] {
  return [CATEGORY_TAG, PRODUCT_TAG, HOME_TAG]
}

function slugDuTag(tag: string, prefixe: string): string | null {
  if (!tag.startsWith(prefixe)) return null
  const slug = tag.slice(prefixe.length)
  return slug === "" ? null : slug
}

export function demandeDePurge(tags: readonly string[]): DemandePurge {
  if (tags.includes(CATEGORY_TAG)) return { kind: "tout" }

  const urls: string[] = []
  const ajouter = (url: string): void => {
    if (!urls.includes(url)) urls.push(url)
  }
  let documentProduitNomme = false

  for (const tag of tags) {
    if (tag === HOME_TAG) {
      ajouter(urlEdge("/"))
      continue
    }
    const slugProduit = slugDuTag(tag, PREFIXE_DETAIL_PRODUIT)
    if (slugProduit !== null) {
      documentProduitNomme = true
      ajouter(urlEdge(urlProduit(slugProduit)))
      continue
    }
    const slugStructure = slugDuTag(tag, PREFIXE_DETAIL_CATEGORIE)
    if (slugStructure !== null) {
      ajouter(urlEdge(`/categorie/${encodeURIComponent(slugStructure)}`))
    }
  }

  if (tags.includes(PRODUCT_TAG) && !documentProduitNomme) {
    return { kind: "tout" }
  }
  return { kind: "urls", urls }
}

async function purgerEdge(
  demande: DemandePurge,
  port: PortPurgeEdge | undefined
): Promise<void> {
  try {
    const resultat = await (port ?? creerPurgeEdgeCloudflare()).purger(demande)
    if (!resultat.ok) {
      console.warn(
        `[cache] purge de l'edge non effectuée (${resultat.erreur.code}) : ${resultat.erreur.message}`
      )
    }
  } catch (error) {
    console.warn("[cache] purge de l'edge non effectuée", error)
  }
}

export interface OptionsInvalidationCatalogue {
  purgeEdge?: PortPurgeEdge
}

export interface OptionsInvalidationStructure {
  purgeEdge?: PortPurgeEdge
}

export async function invalidateCatalogue(
  product: CatalogueEventProduct,
  options: OptionsInvalidationCatalogue = {}
): Promise<void> {
  const tags = tagsCatalogue(product)
  for (const tag of tags) revalidateTag(tag, "max")
  revalidatePath("/admin/produits")
  revalidatePath(`/admin/produits/${product.id}`)
  await purgerEdge(demandeDePurge(tags), options.purgeEdge)
}

export async function invalidateStructure(
  options: OptionsInvalidationStructure = {}
): Promise<void> {
  const tags = tagsStructure()
  for (const tag of tags) revalidateTag(tag, "max")
  revalidatePath("/admin/categories")
  await purgerEdge(demandeDePurge(tags), options.purgeEdge)
}

export function invalidateLivraison(): void {
  revalidatePath("/admin/villes")
  revalidatePath("/admin/livraison")
}

export function invalidateCommande(orderId: string): void {
  revalidatePath("/admin")
  revalidatePath("/admin/commandes")
  revalidatePath(`/admin/commandes/${orderId}`)
  revalidatePath("/commandes")
  revalidatePath(`/commande/confirmation/${orderId}`)
}
