import {
  lireArticlesPanierVisiteur,
  possedeCookiePanierVisiteur,
  supprimerCookiePanierVisiteur,
} from "@/lib/panier"
import { addToCart } from "@/lib/use-cases/cart"

export async function replayPanierVisiteur(userId: string): Promise<void> {
  if (!(await possedeCookiePanierVisiteur())) return

  for (const article of await lireArticlesPanierVisiteur()) {
    try {
      await addToCart(userId, article.variantId, article.quantity)
    } catch {
      continue
    }
  }

  await supprimerCookiePanierVisiteur()
}
