"use server"

import { getSessionUser } from "@/lib/use-cases/get-session"
import { ProfileValidationError, updateProfile } from "@/lib/use-cases/account"
import { DeliveryCityNotFoundError } from "@/lib/use-cases/cart"

export interface ProfileFormState {
  success?: boolean
  error?: string
}

export async function updateProfileAction(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const user = await getSessionUser()
  if (!user) return { error: "Vous devez être connecté" }

  const cityId = String(formData.get("cityId") ?? "")
  try {
    await updateProfile(user.id, {
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      cityId: cityId || null,
    })
  } catch (error) {
    if (error instanceof ProfileValidationError || error instanceof DeliveryCityNotFoundError) {
      return { error: error.message }
    }
    throw error
  }
  return { success: true }
}
