"use server"

import { redirect } from "next/navigation"

import type { OrderStatus } from "@/lib/generated/prisma/client"
import { estStatut } from "@/lib/statut-de-commande"
import {
  adminTaskAction,
  INVALID_FORM_MESSAGE,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import { updateOrderStatus } from "@/lib/use-cases/orders"

export const updateOrderStatusAction = adminTaskAction<{
  orderId: string
  nextStatus: OrderStatus
}>({
  next: "/admin/commandes",
  parse: (formData) => {
    const orderId = parseRequiredId(formData, "orderId")
    const nextStatus = String(formData.get("nextStatus") ?? "")
    if (!estStatut(nextStatus)) throw new Error(INVALID_FORM_MESSAGE)
    return { orderId, nextStatus }
  },
  refusalUrl: ({ orderId }) => `/admin/commandes/${orderId}?transition=refusee`,
  run: async ({ orderId, nextStatus }) => {
    await updateOrderStatus(orderId, nextStatus)
    redirect(`/admin/commandes/${orderId}`)
  },
})
