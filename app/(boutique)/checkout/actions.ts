"use server"

import { redirect } from "next/navigation"

import { updateProfile } from "@/lib/use-cases/account"
import { requireSessionUser } from "@/lib/use-cases/get-session"
import { realOrderEffects } from "@/lib/use-cases/order-effects"
import {
  CheckoutValidationError,
  EmptyCartError,
  OutOfStockError,
  placeOrder,
  type CheckoutInput,
} from "@/lib/use-cases/orders"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/cart"

export interface CheckoutFormState {
  error?: string
}

export async function placeOrderAction(
  _prevState: CheckoutFormState,
  formData: FormData
): Promise<CheckoutFormState> {
  const user = await requireSessionUser("/checkout")

  const input: CheckoutInput = {
    cityId: String(formData.get("cityId") ?? ""),
    address: String(formData.get("address") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  }

  try {
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
  } catch (error) {
    if (
      error instanceof CheckoutValidationError ||
      error instanceof EmptyCartError ||
      error instanceof OutOfStockError ||
      error instanceof DeliveryCityNotFoundError
    ) {
      return { error: error.message }
    }
    throw error
  }
}
