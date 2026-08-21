"use server"

import { redirect } from "next/navigation"

import {
  InvalidOrderTransitionError,
  OrderNotFoundError,
  updateOrderStatus,
} from "@/lib/use-cases/orders"
import { invalidateCommande } from "@/lib/use-cases/cache-invalidation"
import { realOrderEffects } from "@/lib/use-cases/order-effects"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"

export async function updateOrderStatusAction(formData: FormData): Promise<void> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/commandes")

  const orderId = String(formData.get("orderId") ?? "")
  const nextStatus = String(formData.get("nextStatus") ?? "")
  if (!orderId || !nextStatus) return

  let transitionRejected = false
  try {
    await updateOrderStatus(orderId, nextStatus, realOrderEffects)
  } catch (error) {
    if (error instanceof InvalidOrderTransitionError || error instanceof OrderNotFoundError) {
      transitionRejected = true
    } else {
      throw error
    }
  }

  invalidateCommande(orderId)
  redirect(
    transitionRejected ? `/admin/commandes/${orderId}?transition=refusee` : `/admin/commandes/${orderId}`
  )
}
