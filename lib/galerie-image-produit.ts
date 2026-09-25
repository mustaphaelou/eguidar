import { z } from "zod"

export const entreeImagePersisteeSchema = z.object({
  kind: z.literal("persistee"),
  url: z.string().url(),
})

export const entreeBrouillonImageSchema = z.object({
  kind: z.literal("brouillon"),
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
  value: unknown
): EntreeImagePersistee[] {
  const urls = Array.isArray(value)
    ? value.filter((url): url is string => typeof url === "string")
    : []
  return urls.map((url) => ({ kind: "persistee", url }))
}
