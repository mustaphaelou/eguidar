import { z } from "zod"

import cycleVieImageProduit, {
  STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
} from "@/lib/cycle-vie-image-produit"
import { CONTENT_TYPES_IMAGE_PRODUIT } from "@/lib/r2"
import { adminJsonRoute } from "@/lib/use-cases/admin-json-route"

const presignSchema = z.object({
  contentType: z.enum(CONTENT_TYPES_IMAGE_PRODUIT),
  size: z.number().int().positive(),
})

export const POST = adminJsonRoute({
  schema: presignSchema,
  logLabel: "[uploads] presign",
  failureMessage: "Échec de la préparation du téléversement",
  statuses: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
  run: async (input, client) => {
    const resultat = await cycleVieImageProduit.demanderBrouillon({
      ownerId: client.id,
      contentType: input.contentType,
      size: input.size,
    })
    if (!resultat.ok) return resultat

    return {
      ok: true,
      body: {
        draftId: resultat.draftId,
        uploadUrl: resultat.uploadUrl,
        previewUrl: resultat.previewUrl,
        expiresAt: resultat.expiresAt,
      },
    }
  },
})
