"use client"

import { useActionState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { centsToInputValue } from "@/lib/money"

export interface CityFormState {
  error?: string
}

interface CityFormProps {
  city?: { id: string; name: string; fee: number }
  action: (prevState: CityFormState, formData: FormData) => Promise<CityFormState>
}

export function CityForm({ city, action }: CityFormProps) {
  const [state, formAction, isPending] = useActionState(action, {})

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {city?.id ? <input type="hidden" name="cityId" value={city.id} /> : null}

      {state.error ? (
        <p className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nom de la ville</Label>
            <Input id="name" name="name" required defaultValue={city?.name} placeholder="Casablanca" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="fee">Frais de livraison (MAD)</Label>
            <Input
              id="fee"
              name="fee"
              type="number"
              required
              min="0"
              step="0.01"
              defaultValue={city ? centsToInputValue(city.fee) : ""}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? "Enregistrement…" : "Enregistrer la ville"}
        </Button>
      </div>
    </form>
  )
}
