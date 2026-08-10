"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { centsToInputValue } from "@/lib/money"

export interface ShippingSettingsFormState {
  error?: string
}

interface ShippingSettingsFormProps {
  threshold: number | null
  action: (
    prevState: ShippingSettingsFormState,
    formData: FormData
  ) => Promise<ShippingSettingsFormState>
}

export function ShippingSettingsForm({ threshold, action }: ShippingSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {state.error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="freeShippingThreshold">Seuil de livraison offerte (MAD)</Label>
        <Input
          id="freeShippingThreshold"
          name="freeShippingThreshold"
          type="number"
          required
          min="0.01"
          step="0.01"
          defaultValue={threshold !== null ? centsToInputValue(threshold) : ""}
        />
        <p className="text-sm text-muted-foreground">
          Les commandes dont le sous-total atteint ce montant bénéficient de la livraison gratuite,
          quel que soit le frais de la ville.
        </p>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer le seuil"}
        </Button>
      </div>
    </form>
  )
}
