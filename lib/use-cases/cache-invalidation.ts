import { revalidatePath, revalidateTag } from "next/cache"

import { urlProduit } from "@/lib/carte-produit"
import type { DemandePurge, PortPurgeEdge } from "@/lib/purge-edge"
import { creerPurgeEdgeCloudflare } from "@/lib/purge-edge-cloudflare"
import type { LectureStructure } from "@/lib/use-cases/lecture-structure"
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

/**
 * La chaîne de Structures qu'un Produit nomme, réduite à des slugs : la
 * projection que partagent l'enregistrement d'un Produit et les Commande.
 */
export function chaineDeLaStructure(
  lecture: Pick<LectureStructure, "filAriane">,
  categoryId: string | null | undefined
): CatalogueEventCategory[] {
  return categoryId
    ? lecture.filAriane(categoryId).map(({ slug }) => ({ slug }))
    : []
}

function revaliderTags(tags: readonly string[]): void {
  for (const tag of tags) revalidateTag(tag, "max")
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

export interface OptionsInvalidation {
  purgeEdge?: PortPurgeEdge
}

/** Le même contrat pour le catalogue et la Structure ; conservé par API. */
export type OptionsInvalidationCatalogue = OptionsInvalidation
export type OptionsInvalidationStructure = OptionsInvalidation

/**
 * Les deux moitiés de l'invalidation d'un Produit, séparées pour que les
 * automatisations durables puissent les confier à deux actions distinctes :
 * le cache Next d'un côté, le bord de l'autre. `invalidateCatalogue` reste la
 * porte unique des mutations qui font les deux d'un coup (ADR-0014).
 */
export function revaliderCatalogue(product: CatalogueEventProduct): void {
  revaliderTags(tagsCatalogue(product))
  revalidatePath("/admin/produits")
  revalidatePath(`/admin/produits/${product.id}`)
}

export function demandeDePurgeCatalogue(
  product: CatalogueEventProduct
): DemandePurge {
  return demandeDePurge(tagsCatalogue(product))
}

export async function invalidateCatalogue(
  product: CatalogueEventProduct,
  options: OptionsInvalidationCatalogue = {}
): Promise<void> {
  revaliderCatalogue(product)
  await purgerEdge(demandeDePurgeCatalogue(product), options.purgeEdge)
}

/**
 * Invalide les documents des Produits qu'une écriture a touchés sans passer par
 * l'enregistrement d'un seul Produit — la prise de Commande et son retour en
 * stock. Les tags d'un Produit nommé se traduisent en ses documents d'edge —
 * sa fiche, ses Structures et l'accueil — et ces seuls documents sont purgés,
 * pas tout le catalogue. Sans les surfaces d'Administration.
 */
export async function invalidateProduits(
  produits: readonly CatalogueEventProduct[],
  options: OptionsInvalidationCatalogue = {}
): Promise<void> {
  if (produits.length === 0) return
  const tags = [
    ...new Set(produits.flatMap((produit) => tagsCatalogue(produit))),
  ]
  revaliderTags(tags)
  await purgerEdge(demandeDePurge(tags), options.purgeEdge)
}

export async function invalidateStructure(
  options: OptionsInvalidationStructure = {}
): Promise<void> {
  const tags = tagsStructure()
  revaliderTags(tags)
  revalidatePath("/admin/categories")
  await purgerEdge(demandeDePurge(tags), options.purgeEdge)
}

/**
 * La purge du bord pour le travailleur durable : même adaptateur, même
 * vocabulaire d'erreur, mais un échec remonte au lieu d'être avalé — c'est lui
 * qui déclenche la reprise. Une purge non configurée n'est pas un échec.
 */
export async function purgerEdgeDurable(demande: DemandePurge): Promise<void> {
  const resultat = await creerPurgeEdgeCloudflare().purger(demande)
  if (!resultat.ok && resultat.erreur.code !== "non-configure") {
    throw new Error(resultat.erreur.message)
  }
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
