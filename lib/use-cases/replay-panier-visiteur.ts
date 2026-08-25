import { cookies } from "next/headers"

import {
  NOM_COOKIE_PANIER_VISITEUR,
  parsePanierVisiteur,
} from "@/lib/panier-visiteur"
import { addToCart } from "@/lib/use-cases/cart"

export async function replayPanierVisiteur(userId: string): Promise<void> {
  const cookieStore = await cookies()
  const brut = cookieStore.get(NOM_COOKIE_PANIER_VISITEUR)?.value
  if (!brut) return

  for (const article of parsePanierVisiteur(brut)) {
    try {
      await addToCart(userId, article.variantId, article.quantity)
    } catch {
      continue
    }
  }

  cookieStore.delete(NOM_COOKIE_PANIER_VISITEUR)
}
