"use server"

import { redirect } from "next/navigation"

import { updateProfile } from "@/lib/use-cases/account"
import { formAction } from "@/lib/use-cases/mutation-actions"
import { placeOrder, type CheckoutInput } from "@/lib/use-cases/orders"

export interface CheckoutFormState {
  error?: string
  unauthenticated?: true
}

function parseCheckoutFormData(formData: FormData): CheckoutInput {
  return {
    cityId: String(formData.get("cityId") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  }
}

export const placeOrderAction: (
  prevState: CheckoutFormState,
  formData: FormData
) => Promise<CheckoutFormState> = formAction<CheckoutInput, CheckoutFormState>({
  parse: parseCheckoutFormData,
  run: async (input, user) => {
    const order = await placeOrder(user.id, input)
    try {
      await updateProfile(user.id, {
        phone: input.phone,
        address: input.address,
        cityId: input.cityId,
      })
    } catch {}
    redirect(`/commande/confirmation/${order.id}`)
  },
})
