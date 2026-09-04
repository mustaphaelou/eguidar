"use server"

import { redirect } from "next/navigation"

import {
  adminTaskAction,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import { updateOrderStatus } from "@/lib/use-cases/orders"

export const updateOrderStatusAction = adminTaskAction<{
  orderId: string
  nextStatus: string
}>({
  next: "/admin/commandes",
  parse: (formData) => ({
    orderId: parseRequiredId(formData, "orderId"),
    nextStatus: parseRequiredId(formData, "nextStatus"),
  }),
  refusalUrl: ({ orderId }) => `/admin/commandes/${orderId}?transition=refusee`,
  run: async ({ orderId, nextStatus }) => {
    await updateOrderStatus(orderId, nextStatus)
    redirect(`/admin/commandes/${orderId}`)
  },
})
