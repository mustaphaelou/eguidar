import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"

/** Délai au-delà duquel le build considère que le catalogue ne répond pas. */
export const DELAI_ACCES_CATALOGUE_MS = 5_000

export interface FaitsCatalogue {
  produits: number
  categories: number
  articles: number
}

export interface OptionsAccesCatalogue {
  url: string | undefined
  delaiMs?: number
}

export function estCatalogueVide(faits: FaitsCatalogue): boolean {
  return faits.produits === 0 && faits.categories === 0 && faits.articles === 0
}

function accorder(nombre: number, singulier: string, pluriel: string): string {
  return `${nombre} ${nombre > 1 ? pluriel : singulier}`
}

export function messageDesFaitsCatalogue(faits: FaitsCatalogue): string {
  const comptes = [
    accorder(faits.produits, "produit", "produits"),
    accorder(faits.categories, "catégorie", "catégories"),
    accorder(faits.articles, "article", "articles"),
  ].join(", ")

  if (estCatalogueVide(faits)) {
    return `[catalogue] joignable mais vide (${comptes}) : le build continue, les routes dynamiques rendront le paramètre de repli.`
  }
  return `[catalogue] joignable (${comptes}) : le build peut prérendre le catalogue.`
}

/**
 * Lit ce que le build s'apprête à prérendre. Le client est créé pour cet
 * appel seulement, avec un délai court porté par le pilote : un build qui ne
 * peut pas lire le catalogue doit s'arrêter vite, pas attendre le prérendu.
 */
export async function lireLesFaitsDuCatalogue(
  options: OptionsAccesCatalogue
): Promise<FaitsCatalogue> {
  const url = options.url?.trim()
  if (url === undefined || url === "") {
    throw new Error(
      "DATABASE_URL absente : le build ne peut pas lire le catalogue à prérendre."
    )
  }

  const delaiMs = options.delaiMs ?? DELAI_ACCES_CATALOGUE_MS
  const prisma = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url,
      connectionTimeoutMillis: delaiMs,
      query_timeout: delaiMs,
    }),
  })

  try {
    const [produits, categories, articles] = await Promise.all([
      prisma.product.count(),
      prisma.category.count(),
      prisma.articleBlog.count({
        where: { statut: { in: ["publie", "archive"] } },
      }),
    ])
    return { produits, categories, articles }
  } catch (erreur) {
    const cause = erreur instanceof Error ? erreur.message : String(erreur)
    throw new Error(
      `catalogue injoignable ou illisible (délai ${delaiMs} ms) : ${cause}`
    )
  } finally {
    await prisma.$disconnect().catch(() => {})
  }
}
