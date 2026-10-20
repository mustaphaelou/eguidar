import { z } from "zod"

import { estUrlImageProduitPersistee } from "@/lib/espace-de-noms-image-produit"

export const LIMITE_IMAGES_PRODUIT = 8

const MESSAGE_IMAGE_PRODUIT_HORS_CDN =
  "Une Image produit persistée doit être servie par le CDN de la boutique"

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

export function galerieImageProduitSchema(
  basePubliqueImageProduit: string | null
) {
  return z
    .array(entreeGalerieImageProduitSchema)
    .superRefine((galerie, contexte) => {
      galerie.forEach((entree, position) => {
        if (entree.kind !== "persistee") return
        if (estUrlImageProduitPersistee(entree.url, basePubliqueImageProduit)) {
          return
        }
        contexte.addIssue({
          code: "custom",
          message: MESSAGE_IMAGE_PRODUIT_HORS_CDN,
          path: [position, "url"],
        })
      })
    })
}

export type EntreeImageProduit = z.infer<typeof entreeGalerieImageProduitSchema>
export type EntreeImagePersistee = z.infer<typeof entreeImagePersisteeSchema>
export type EntreeBrouillonImage = z.infer<typeof entreeBrouillonImageSchema>

export function identifiantsBrouillonsGalerie(
  galerie: readonly EntreeImageProduit[]
): string[] {
  return [
    ...new Set(
      galerie.flatMap((entree) =>
        entree.kind === "brouillon" ? [entree.draftId] : []
      )
    ),
  ]
}
