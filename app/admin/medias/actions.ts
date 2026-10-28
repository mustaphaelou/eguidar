"use server"

import { revalidatePath } from "next/cache"

import {
  mettreAJourTexteAlternatif,
  reconstituerRegistreImagesProduit,
  supprimerImagesProduit,
} from "@/lib/use-cases/images-produit"
import { adminFormAction } from "@/lib/use-cases/mutation-actions"

export interface MediasActionState {
  error?: string
}

function urlsSelectionnees(formData: FormData): string[] {
  return [
    ...new Set(
      formData
        .getAll("publicUrl")
        .map((valeur) => String(valeur).trim())
        .filter((valeur) => valeur.length > 0)
    ),
  ]
}

export const supprimerImagesAction = adminFormAction<
  { publicUrls: string[] },
  MediasActionState
>({
  next: "/admin/medias",
  parse: (formData) => ({ publicUrls: urlsSelectionnees(formData) }),
  run: async ({ publicUrls }) => {
    await supprimerImagesProduit(publicUrls)
    revalidatePath("/admin/medias")
    return {}
  },
})

export const mettreAJourAltImageAction = adminFormAction<
  { publicUrl: string; alt: string },
  MediasActionState
>({
  next: "/admin/medias",
  parse: (formData) => ({
    publicUrl: String(formData.get("publicUrl") ?? "").trim(),
    alt: String(formData.get("alt") ?? ""),
  }),
  run: async ({ publicUrl, alt }) => {
    await mettreAJourTexteAlternatif(publicUrl, alt)
    revalidatePath("/admin/medias")
    return {}
  },
})

export const reconcilierImagesAction = adminFormAction<
  Record<string, never>,
  MediasActionState
>({
  next: "/admin/medias",
  parse: () => ({}),
  run: async () => {
    await reconstituerRegistreImagesProduit()
    revalidatePath("/admin/medias")
    return {}
  },
})
