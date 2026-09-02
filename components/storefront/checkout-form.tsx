"use client"

import { useActionState, useEffect, useState } from "react"

import { Cash01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  placeOrderAction,
  type CheckoutFormState,
} from "@/app/(boutique)/checkout/actions"
import { syncLoginUrl } from "@/components/auth/sync-url"
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
import { RecapitulatifPaiement } from "@/components/storefront/recapitulatif-paiement"
import { formatShippingFee } from "@/lib/money"
import type {
  DeliveryCityOption,
  ShippingQuote,
} from "@/lib/use-cases/livraison"

export interface CheckoutFormProps {
  cities: DeliveryCityOption[]
  quotes: Record<string, ShippingQuote>
  initialCityId: string | null
  initialAddress: string
  initialPhone: string
  subtotal: number
}

const initialState: CheckoutFormState = { error: undefined }

export function CheckoutForm({
  cities,
  quotes,
  initialCityId,
  initialAddress,
  initialPhone,
  subtotal,
}: CheckoutFormProps) {
  const [state, formAction, isPending] = useActionState(
    placeOrderAction,
    initialState
  )
  const [selectedCityId, setSelectedCityId] = useState(initialCityId ?? "")
  const quote = selectedCityId ? quotes[selectedCityId] : undefined
  const shippingFee = quote ? quote.shippingFee : null

  useEffect(() => {
    if (!state.unauthenticated) return
    syncLoginUrl()
  }, [state])

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

      <div className="flex flex-col gap-2">
        <Label htmlFor="checkout-city">Ville de livraison</Label>
        <Select
          name="cityId"
          value={selectedCityId}
          onValueChange={(cityId) => setSelectedCityId(cityId ?? "")}
          required
        >
          <SelectTrigger id="checkout-city" className="w-full">
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="checkout-address">Adresse complète</Label>
        <Input
          id="checkout-address"
          name="address"
          type="text"
          defaultValue={initialAddress}
          placeholder="N°, rue, quartier, immeuble…"
          required
          minLength={5}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="checkout-phone">Téléphone</Label>
        <Input
          id="checkout-phone"
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={initialPhone}
          placeholder="+212 6 00 00 00 00"
          required
          minLength={8}
        />
      </div>

      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <HugeiconsIcon icon={Cash01Icon} strokeWidth={2} className="size-4" />
          Paiement à la livraison
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Réglez en espèces au livreur lors de la réception de votre colis.
          C&apos;est le seul mode de paiement disponible.
        </p>
      </div>

      <RecapitulatifPaiement
        className="border-t pt-4"
        sousTotal={subtotal}
        shipping={shippingFee !== null ? { fee: shippingFee } : null}
        total={quote ? quote.total : null}
      />

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Commande en cours…" : "Confirmer la commande"}
      </Button>
    </form>
  )
}
