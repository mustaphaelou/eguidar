"use server"

import {
  adminFormAction,
  parseMoneyField,
} from "@/lib/use-cases/mutation-actions"
import { updateShippingSettings } from "@/lib/use-cases/livraison"
import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

export const updateShippingSettingsAction = adminFormAction<{
  freeShippingThreshold: number
}>({
  next: "/admin/livraison",
  parse: (formData) => ({
    freeShippingThreshold: parseMoneyField(formData, "freeShippingThreshold"),
  }),
  run: async (input) => {
    await updateShippingSettings(input, realLivraisonEffects)
    return {}
  },
})
