"use server"

import { redirect } from "next/navigation"

import {
  adminFormAction,
  adminTaskAction,
  INVALID_FORM_MESSAGE,
} from "@/lib/use-cases/mutation-actions"
import { parseMadToCents } from "@/lib/money"
import {
  createCity,
  deleteCity,
  updateCity,
  type CityInput,
} from "@/lib/use-cases/livraison"
import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

function parseCityFormData(formData: FormData): CityInput {
  const cents = parseMadToCents(String(formData.get("fee") ?? ""))
  if (cents === null) throw new Error(INVALID_FORM_MESSAGE)
  return {
    name: String(formData.get("name") ?? ""),
    fee: cents,
  }
}

interface CityUpdateInput extends CityInput {
  cityId: string
}

export const createCityAction = adminFormAction<CityInput>({
  next: "/admin/villes",
  parse: parseCityFormData,
  run: async (input) => {
    await createCity(input, realLivraisonEffects)
    redirect("/admin/villes")
  },
})

export const updateCityAction = adminFormAction<CityUpdateInput>({
  next: "/admin/villes",
  parse: (formData) => {
    const cityId = String(formData.get("cityId") ?? "")
    if (!cityId) throw new Error(INVALID_FORM_MESSAGE)
    return { ...parseCityFormData(formData), cityId }
  },
  run: async ({ cityId, ...input }) => {
    await updateCity(cityId, input, realLivraisonEffects)
    redirect("/admin/villes")
  },
})

export const deleteCityAction = adminTaskAction<{ cityId: string }>({
  next: "/admin/villes",
  parse: (formData) => {
    const cityId = String(formData.get("cityId") ?? "")
    return cityId ? { cityId } : null
  },
  run: async ({ cityId }) => {
    await deleteCity(cityId, realLivraisonEffects)
  },
})
