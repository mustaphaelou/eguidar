"use server"

import { redirect } from "next/navigation"

import { adminTaskAction } from "@/lib/use-cases/mutation-actions"
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation"
import { realOrderEffects } from "@/lib/use-cases/order-effects"
import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  updateOrderStatus,
} from "@/lib/use-cases/orders"

export const updateOrderStatusAction = adminTaskAction<{
  orderId: string
  nextStatus: string
}>({
  next: "/admin/commandes",
  parse: (formData) => {
    const orderId = String(formData.get("orderId") ?? "")
    const nextStatus = String(formData.get("nextStatus") ?? "")
    return orderId && nextStatus ? { orderId, nextStatus } : null
  },
  run: async ({ orderId, nextStatus }) => {
    let transitionRejected = false
    try {
      await updateOrderStatus(orderId, nextStatus, realOrderEffects)
    } catch (error) {
      if (
        error instanceof InvalidOrderTransitionError ||
        error instanceof OrderNotFoundError
      ) {
        transitionRejected = true
      } else {
        throw error
      }
    }

    invalidateCommande(orderId)
    redirect(
      transitionRejected
        ? `/admin/commandes/${orderId}?transition=refusee`
        : `/admin/commandes/${orderId}`
    )
  },
})
