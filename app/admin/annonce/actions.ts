"use server"

import { updateAnnonce, type AnnonceInput } from "@/lib/use-cases/annonce"
import {
  adminFormAction,
  type MutationActionState,
} from "@/lib/use-cases/mutation-actions"

export interface AnnonceFormState extends MutationActionState {
  saved?: boolean
}

function parseActifField(formData: FormData): boolean {
  const value = formData.get("actif")
  return value === "true" || value === "on"
}

export const updateAnnonceAction = adminFormAction<
  AnnonceInput,
  AnnonceFormState
>({
  next: "/admin/annonce",
  parse: (formData) => ({
    actif: parseActifField(formData),
    message: String(formData.get("message") ?? ""),
    lienUrl: String(formData.get("lienUrl") ?? ""),
    lienLibelle: String(formData.get("lienLibelle") ?? ""),
  }),
  run: async (input) => {
    await updateAnnonce(input)
    return { saved: true }
  },
})
