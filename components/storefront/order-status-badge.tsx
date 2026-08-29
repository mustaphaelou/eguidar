import type { VariantProps } from "class-variance-authority"

import { Badge, badgeVariants } from "@/components/ui/badge"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import {
  ORDER_STATUS_LABELS,
  REGISTRE_STATUTS,
  type TonStatut,
} from "@/lib/order-status"

const toneVariants: Record<
  TonStatut,
  VariantProps<typeof badgeVariants>["variant"]
> = {
  neutre: "outline",
  intermédiaire: "secondary",
  positif: "default",
  négatif: "destructive",
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <Badge variant={toneVariants[REGISTRE_STATUTS[status].ton]}>
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  )
}
