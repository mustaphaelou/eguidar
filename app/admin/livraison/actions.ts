"use server"

import {
  adminFormAction,
  INVALID_FORM_MESSAGE,
} from "@/lib/use-cases/mutation-actions"
import { parseMadToCents } from "@/lib/money"
import { updateShippingSettings } from "@/lib/use-cases/livraison"
import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

export const updateShippingSettingsAction = adminFormAction<{
  freeShippingThreshold: number
}>({
  next: "/admin/livraison",
  parse: (formData) => {
    const cents = parseMadToCents(String(formData.get("freeShippingThreshold") ?? ""))
    if (cents === null) throw new Error(INVALID_FORM_MESSAGE)
    return { freeShippingThreshold: cents }
  },
  run: async (input) => {
    await updateShippingSettings(input, realLivraisonEffects)
    return {}
  },
})
