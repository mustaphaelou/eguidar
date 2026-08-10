import type { VariantProps } from "class-variance-authority"

import { Badge, badgeVariants } from "@/components/ui/badge"
import { OrderStatus } from "@/lib/generated/prisma/client"
import { ORDER_STATUS_LABELS } from "@/lib/order-status"

const statusVariants: Record<OrderStatus, VariantProps<typeof badgeVariants>["variant"]> = {
  pending: "outline",
  confirmed: "secondary",
  shipped: "default",
  delivered: "default",
  cancelled: "destructive",
  returned: "destructive",
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge variant={statusVariants[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
}
