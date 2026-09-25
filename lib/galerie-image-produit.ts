import { z } from "zod"

export const entreeImagePersisteeSchema = z.object({
  kind: z.literal("persisted"),
  url: z.string().url(),
})

export const entreeBrouillonImageSchema = z.object({
  kind: z.literal("draft"),
  draftId: z.string().min(1),
  previewUrl: z.string().url(),
})

export const entreeGalerieImageProduitSchema = z.discriminatedUnion("kind", [
  entreeImagePersisteeSchema,
  entreeBrouillonImageSchema,
])

export const galerieImageProduitSchema = z.array(
  entreeGalerieImageProduitSchema
)

export type EntreeImageProduit = z.infer<typeof entreeGalerieImageProduitSchema>
export type EntreeImagePersistee = z.infer<typeof entreeImagePersisteeSchema>
export type EntreeBrouillonImage = z.infer<typeof entreeBrouillonImageSchema>

export function entreesPersisteesDepuisUrls(
  urls: readonly string[]
): EntreeImagePersistee[] {
  return urls.map((url) => ({ kind: "persisted", url }))
}
