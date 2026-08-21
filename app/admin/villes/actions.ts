"use server"

import { redirect } from "next/navigation"

import type { CityFormState } from "@/components/admin/city-form"
import { parseMadToCents } from "@/lib/money"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"
import {
  CityNameConflictError,
  CityNotFoundError,
  CityValidationError,
  createCity,
  deleteCity,
  updateCity,
  type CityInput,
} from "@/lib/use-cases/livraison"
import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

const INVALID_FORM_MESSAGE = "Formulaire invalide"

class FormParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "FormParseError"
  }
}

function parseCityFormData(formData: FormData): CityInput {
  const cents = parseMadToCents(String(formData.get("fee") ?? ""))
  if (cents === null) throw new FormParseError(INVALID_FORM_MESSAGE)
  return {
    name: String(formData.get("name") ?? ""),
    fee: cents,
  }
}

function toActionError(error: unknown): CityFormState {
  if (
    error instanceof FormParseError ||
    error instanceof CityValidationError ||
    error instanceof CityNameConflictError ||
    error instanceof CityNotFoundError
  ) {
    return { error: error.message }
  }
  throw error
}

export async function createCityAction(
  _prevState: CityFormState,
  formData: FormData
): Promise<CityFormState> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/villes")

  let input: CityInput
  try {
    input = parseCityFormData(formData)
  } catch (error) {
    return toActionError(error)
  }

  try {
    await createCity(input, realLivraisonEffects)
    redirect("/admin/villes")
  } catch (error) {
    return toActionError(error)
  }
}

export async function updateCityAction(
  _prevState: CityFormState,
  formData: FormData
): Promise<CityFormState> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/villes")

  const cityId = String(formData.get("cityId") ?? "")
  if (!cityId) return { error: INVALID_FORM_MESSAGE }

  let input: CityInput
  try {
    input = parseCityFormData(formData)
  } catch (error) {
    return toActionError(error)
  }

  try {
    await updateCity(cityId, input, realLivraisonEffects)
    redirect("/admin/villes")
  } catch (error) {
    return toActionError(error)
  }
}

export async function deleteCityAction(formData: FormData): Promise<void> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/villes")

  const cityId = String(formData.get("cityId") ?? "")
  if (cityId) {
    try {
      await deleteCity(cityId, realLivraisonEffects)
    } catch (error) {
      if (!(error instanceof CityNotFoundError)) throw error
    }
  }
}
