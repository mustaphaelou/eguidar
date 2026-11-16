import type { RefundMode } from "@/lib/generated/prisma/client"

export const MODES_REMBOURSEMENT = [
  "cash",
  "transfer",
] as const satisfies readonly RefundMode[]

export type ModeRemboursement = (typeof MODES_REMBOURSEMENT)[number]

export interface ArticleRemboursable {
  id: string
  price: number
  quantity: number
}

export interface LigneDeclareeRemboursee {
  orderItemId: string
  declaredQuantity: number
}

export function attenteDeRemboursement({
  montantEncaisse,
  articles,
  lignesDeclarees,
}: {
  montantEncaisse: number
  articles: readonly ArticleRemboursable[]
  lignesDeclarees: readonly LigneDeclareeRemboursee[]
}): number {
  const declarees = new Map(
    lignesDeclarees.map((ligne) => [ligne.orderItemId, ligne.declaredQuantity])
  )
  const retraitComplet = articles.every(
    (article) => (declarees.get(article.id) ?? 0) >= article.quantity
  )
  if (retraitComplet) return montantEncaisse

  return articles.reduce(
    (total, article) =>
      total + article.price * (declarees.get(article.id) ?? 0),
    0
  )
}
