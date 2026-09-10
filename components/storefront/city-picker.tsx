"use client"

import { useRouter } from "next/navigation"

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

export function CityPicker({
  cities,
  selectedId,
  path,
}: {
  cities: DeliveryCityOption[]
  selectedId: string | null
  path: string
}) {
  const router = useRouter()

  function handleChange(cityId: string | null) {
    if (!cityId) return
    router.push(`${path}?ville=${encodeURIComponent(cityId)}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="city">Ville de livraison</Label>
      <Select
        value={selectedId ?? ""}
        items={cities.map((city) => ({ value: city.id, label: city.name }))}
        onValueChange={handleChange}
      >
        <SelectTrigger id="city" className="w-full sm:w-72">
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
  )
}
