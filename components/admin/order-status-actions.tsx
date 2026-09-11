"use client"

import type { VariantProps } from "class-variance-authority"

import { Button, type buttonVariants } from "@/components/ui/button"
import type { OrderStatus } from "@/lib/generated/prisma/client"
import { REGISTRE_STATUTS, type TonStatut } from "@/lib/statut-de-commande"

const toneVariants: Record<
  TonStatut,
  VariantProps<typeof buttonVariants>["variant"]
> = {
  neutre: "ghost",
  intermédiaire: "secondary",
  positif: "default",
  négatif: "destructive",
}

interface OrderStatusActionsProps {
  orderId: string
  nextStatuses: readonly OrderStatus[]
  action: (formData: FormData) => Promise<void>
}

export function OrderStatusActions({
  orderId,
  nextStatuses,
  action,
}: OrderStatusActionsProps) {
  if (nextStatuses.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Aucune action disponible pour ce statut.
      </p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nextStatuses.map((status) => {
        const spec = REGISTRE_STATUTS[status]
        if (spec.verbe === null) return null
        return (
          <form key={status} action={action}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="nextStatus" value={status} />
            <Button type="submit" size="sm" variant={toneVariants[spec.ton]}>
              {spec.verbe}
            </Button>
          </form>
        )
      })}
    </div>
  )
}
