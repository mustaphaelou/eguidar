import { revalidateTag } from "next/cache"

import type { LivraisonEffects } from "@/lib/use-cases/livraison"

export const SHIPPING_TAG = "shipping"

export const realLivraisonEffects: LivraisonEffects = {
  revalidateShipping() {
    revalidateTag(SHIPPING_TAG, "max")
  },
}
