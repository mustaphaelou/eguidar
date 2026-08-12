"use client"

import { useActionState } from "react"

import { updateProfileAction, type ProfileFormState } from "@/app/(boutique)/profil/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatShippingFee } from "@/lib/money"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison"

export interface ProfileFormProps {
  cities: DeliveryCityOption[]
  initialCityId: string | null
  initialAddress: string
  initialPhone: string
}

const initialState: ProfileFormState = { error: undefined }

export function ProfileForm({
  cities,
  initialCityId,
  initialAddress,
  initialPhone,
}: ProfileFormProps) {
  const [state, formAction, isPending] = useActionState(updateProfileAction, initialState)

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-xl border border-emerald-600/30 bg-emerald-600/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          Profil enregistré.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-phone">Téléphone</Label>
        <Input
          id="profile-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={initialPhone}
          placeholder="+212 6 00 00 00 00"
          required
          minLength={8}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-address">Adresse complète</Label>
        <Input
          id="profile-address"
          name="address"
          type="text"
          defaultValue={initialAddress}
          placeholder="N°, rue, quartier, immeuble…"
          required
          minLength={5}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="profile-city">Ville de livraison</Label>
        <Select name="cityId" defaultValue={initialCityId ?? ""}>
          <SelectTrigger id="profile-city" className="w-full">
            <SelectValue placeholder="Choisir une ville" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {cities.map((city) => (
                <SelectItem key={city.id} value={city.id}>
                  {city.name} — {formatShippingFee(city.fee)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>

      <Button type="submit" disabled={isPending} className="w-full sm:w-auto">
        {isPending ? "Enregistrement…" : "Enregistrer"}
      </Button>
    </form>
  )
}
