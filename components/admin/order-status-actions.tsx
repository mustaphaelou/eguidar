"use client"

import type { VariantProps } from "class-variance-authority"

import { Button, type buttonVariants } from "@/components/ui/button"
import type { OrderStatus } from "@/lib/generated/prisma/client"

const STATUS_ACTIONS: Partial<
  Record<OrderStatus, { label: string; variant: VariantProps<typeof buttonVariants>["variant"] }>
> = {
  confirmed: { label: "Confirmer", variant: "secondary" },
  shipped: { label: "Expédier", variant: "default" },
  delivered: { label: "Marquer livrée", variant: "default" },
  cancelled: { label: "Annuler", variant: "destructive" },
  returned: { label: "Retourner", variant: "destructive" },
}

interface OrderStatusActionsProps {
  orderId: string
  nextStatuses: OrderStatus[]
  action: (formData: FormData) => Promise<void>
}

export function OrderStatusActions({ orderId, nextStatuses, action }: OrderStatusActionsProps) {
  if (nextStatuses.length === 0) {
    return <p className="text-sm text-muted-foreground">Aucune action disponible pour ce statut.</p>
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => {
        const actionSpec = STATUS_ACTIONS[status]
        if (!actionSpec) return null
        return (
          <form key={status} action={action}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="nextStatus" value={status} />
            <Button type="submit" size="sm" variant={actionSpec.variant}>
              {actionSpec.label}
            </Button>
          </form>
        )
      })}
    </div>
  )
}
