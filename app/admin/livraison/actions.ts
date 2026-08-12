"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import type { ShippingSettingsFormState } from "@/components/admin/shipping-settings-form"
import { parseMadToCents } from "@/lib/money"
import { getAdminSession } from "@/lib/use-cases/get-admin-session"
import {
  ShippingValidationError,
  updateShippingSettings,
} from "@/lib/use-cases/livraison"
import { realLivraisonEffects } from "@/lib/use-cases/livraison-effects"

const INVALID_FORM_MESSAGE = "Formulaire invalide"

export async function updateShippingSettingsAction(
  _prevState: ShippingSettingsFormState,
  formData: FormData
): Promise<ShippingSettingsFormState> {
  const session = await getAdminSession()
  if (!session) redirect("/connexion?next=/admin/livraison")

  const cents = parseMadToCents(String(formData.get("freeShippingThreshold") ?? ""))
  if (cents === null) return { error: INVALID_FORM_MESSAGE }

  try {
    await updateShippingSettings({ freeShippingThreshold: cents }, realLivraisonEffects)
    revalidatePath("/admin/livraison")
  } catch (error) {
    if (error instanceof ShippingValidationError) {
      return { error: error.message }
    }
    throw error
  }

  return {}
}
