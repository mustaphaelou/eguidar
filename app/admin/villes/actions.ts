"use server"

import { redirect } from "next/navigation"

import {
  adminFormAction,
  adminTaskAction,
  parseMoneyField,
  parseRequiredId,
} from "@/lib/use-cases/mutation-actions"
import {
  createCity,
  deleteCity,
  updateCity,
  type CityInput,
} from "@/lib/use-cases/livraison"

function parseCityFormData(formData: FormData): CityInput {
  return {
    name: String(formData.get("name") ?? ""),
    fee: parseMoneyField(formData, "fee"),
  }
}

interface CityUpdateInput extends CityInput {
  cityId: string
}

export const createCityAction = adminFormAction<CityInput>({
  next: "/admin/villes",
  parse: parseCityFormData,
  run: async (input) => {
    await createCity(input)
    redirect("/admin/villes")
  },
})

export const updateCityAction = adminFormAction<CityUpdateInput>({
  next: "/admin/villes",
  parse: (formData) => ({
    ...parseCityFormData(formData),
    cityId: parseRequiredId(formData, "cityId"),
  }),
  run: async ({ cityId, ...input }) => {
    await updateCity(cityId, input)
    redirect("/admin/villes")
  },
})

export const deleteCityAction = adminTaskAction<{ cityId: string }>({
  next: "/admin/villes",
  parse: (formData) => ({ cityId: parseRequiredId(formData, "cityId") }),
  run: async ({ cityId }) => {
    await deleteCity(cityId)
  },
})
