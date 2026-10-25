import { z } from "zod"

import cycleVieImageProduit, {
  STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
} from "@/lib/cycle-vie-image-produit"
import { adminJsonRoute } from "@/lib/use-cases/admin-json-route"

const relacherSchema = z
  .object({
    draftId: z.string().min(1),
  })
  .strict()

export const DELETE = adminJsonRoute({
  schema: relacherSchema,
  label: "[uploads] delete",
  failureMessage: "Échec de la libération du Brouillon d'Image produit",
  statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
  run: async (input, client) => {
    const resultat = await cycleVieImageProduit.relacherBrouillon({
      draftId: input.draftId,
      ownerId: client.id,
    })
    if (!resultat.ok) return resultat

    return {
      ok: true,
      body: { released: true, draftId: resultat.draftId },
    }
  },
})
