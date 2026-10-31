import type { Prisma } from "@/lib/generated/prisma/client"

export type StatutArticlePublic = "publie" | "archive"

/**
 * La condition de lecture publique d'un Article : un statut public et une
 * date de publication au plus tard maintenant. Une date nulle ou future
 * n'ouvre aucune URL publique — la publication programmée est une lecture,
 * pas un travail de fond. Toute lecture publique d'ArticleBlog passe par ce
 * prédicat : la landing, la fiche, les slugs de prérendu et la liste des
 * Articles liés (#792).
 */
export function filtreArticlePublic(
  statuts: readonly StatutArticlePublic[] = ["publie"],
  maintenant: Date = new Date()
): Prisma.ArticleBlogWhereInput {
  return {
    statut: { in: [...statuts] },
    publishedAt: { lte: maintenant },
  }
}
