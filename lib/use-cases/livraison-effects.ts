import { invalidateLivraison } from "@/lib/use-cases/cache-invalidation"
import type { LivraisonEffects } from "@/lib/use-cases/livraison"

export const realLivraisonEffects: LivraisonEffects = {
  revalidateShipping() {
    invalidateLivraison()
  },
}
