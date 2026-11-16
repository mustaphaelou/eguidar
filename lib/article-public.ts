import type { Prisma } from "@/lib/generated/prisma/client"

export type StatutArticlePublic = "publie" | "archive"

export function filtreArticlePublic(
  statuts: readonly StatutArticlePublic[] = ["publie"],
  maintenant: Date = new Date()
): Prisma.ArticleBlogWhereInput {
  return {
    statut: { in: [...statuts] },
    publishedAt: { lte: maintenant },
  }
}
