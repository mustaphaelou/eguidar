import { sendOrderPlacedEmail, sendOrderStatusEmail, type OrderEmailSnapshot } from "@/lib/emails"
import { OrderStatus } from "@/lib/generated/prisma/client"

export interface OrderEffects {
  sendOrderPlacedEmail(order: OrderEmailSnapshot): Promise<void>
  sendOrderStatusEmail(order: OrderEmailSnapshot, newStatus: OrderStatus): Promise<void>
}

export const realOrderEffects: OrderEffects = {
  sendOrderPlacedEmail,
  sendOrderStatusEmail,
}
