import { formatShippingFee } from "@/lib/money"
import type { DeliveryCityOption } from "@/lib/use-cases/livraison-prix"

export type CityOption = {
  value: string
  label: string
  optionLabel: string
}

export function cityOptions(cities: DeliveryCityOption[]): CityOption[] {
  return cities.map((city) => ({
    value: city.id,
    label: city.name,
    optionLabel: `${city.name} — ${formatShippingFee(city.fee)}`,
  }))
}
