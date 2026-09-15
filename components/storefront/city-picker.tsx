"use client"

import { useRouter } from "next/navigation"

import { cityOptions } from "@/components/storefront/city-options"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison"
import { villeVersParam } from "@/lib/use-cases/ville-url"

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
  const optionsVilles = cityOptions(cities)

  function handleChange(cityId: string | null) {
    if (!cityId) return
    const city = cities.find((candidate) => candidate.id === cityId)
    if (!city) return
    router.push(`${path}${villeVersParam(city)}`)
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="city">Ville de livraison</Label>
      <Select
        value={selectedId ?? ""}
        items={optionsVilles}
        onValueChange={handleChange}
      >
        <SelectTrigger id="city" className="w-full sm:w-72">
          <SelectValue placeholder="Choisir une ville" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {optionsVilles.map((row) => (
              <SelectItem key={row.value} value={row.value}>
                {row.optionLabel}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}
