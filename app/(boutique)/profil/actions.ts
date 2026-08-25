"use server"

import { updateProfile, type ProfileInput } from "@/lib/use-cases/account"
import { formAction } from "@/lib/use-cases/mutation-actions"

export interface ProfileFormState {
  success?: boolean
  error?: string
}

export const updateProfileAction: (
  prevState: ProfileFormState,
  formData: FormData
) => Promise<ProfileFormState> = formAction<ProfileInput, ProfileFormState>({
  next: "/profil",
  parse: (formData) => ({
    phone: String(formData.get("phone") ?? ""),
    address: String(formData.get("address") ?? ""),
    cityId: String(formData.get("cityId") ?? "") || null,
  }),
  run: async (input, user) => {
    await updateProfile(user.id, input)
    return { success: true }
  },
})
