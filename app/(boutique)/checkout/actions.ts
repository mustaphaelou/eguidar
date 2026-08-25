"use server"

import { redirect } from "next/navigation"

import { updateProfile } from "@/lib/use-cases/account"
import { formAction } from "@/lib/use-cases/mutation-actions"
import { realOrderEffects } from "@/lib/use-cases/order-effects"
import { placeOrder, type CheckoutInput } from "@/lib/use-cases/orders"

export interface CheckoutFormState {
  error?: string
}

function parseCheckoutFormData(formData: FormData): CheckoutInput {
  return {
    cityId: String(formData.get("cityId") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  }
}

export const placeOrderAction = formAction<CheckoutInput, CheckoutFormState>({
  next: "/checkout",
  parse: parseCheckoutFormData,
  run: async (input, user) => {
    const order = await placeOrder(user.id, input, realOrderEffects)
    try {
      await updateProfile(user.id, {
        phone: input.phone,
        address: input.address,
        cityId: input.cityId,
      })
    } catch {
      // Le profil pré-remplit le prochain paiement : son échec ne doit pas bloquer la commande.
    }
    redirect(`/commande/confirmation/${order.id}`)
  },
})
