"use server"

import { redirect } from "next/navigation"

import { parseMadToCents } from "@/lib/money"
import { updateProfile } from "@/lib/use-cases/account"
import {
  formAction,
  INVALID_FORM_MESSAGE,
} from "@/lib/use-cases/mutation-actions"
import {
  CheckoutValidationError,
  placeOrder,
  type CheckoutInput,
} from "@/lib/use-cases/orders"

export interface CheckoutFormState {
  error?: string
  unauthenticated?: true
}

function parseCheckoutFormData(formData: FormData): CheckoutInput {
  const totalAfficheTexte = String(formData.get("totalAffiche") ?? "")
  // parseMadToCents("") rend 0 : la présence se vérifie sur le texte brut.
  if (!totalAfficheTexte.trim()) throw new Error(INVALID_FORM_MESSAGE)

  const totalAffiche = parseMadToCents(totalAfficheTexte)
  if (totalAffiche === null) {
    throw new CheckoutValidationError(["total affiché illisible"])
  }

  return {
    cityId: String(formData.get("cityId") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    totalAffiche,
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
