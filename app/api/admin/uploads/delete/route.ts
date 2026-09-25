import { z } from "zod"

import cycleVieImageProduit, {
  STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT,
} from "@/lib/cycle-vie-image-produit"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const relacherSchema = z
  .object({
    draftId: z.string().min(1),
  })
  .strict()

export async function DELETE(request: Request) {
  const client = await lireSession()
  if (!estAdmin(client))
    return Response.json({ error: "Non autorisé" }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json(
      { error: "Corps de requête invalide" },
      { status: 400 }
    )
  }

  const parsed = relacherSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: "Requête invalide" }, { status: 400 })

  try {
    const resultat = await cycleVieImageProduit.relacherBrouillon({
      draftId: parsed.data.draftId,
      ownerId: client.id,
    })
    if (!resultat.ok) {
      return Response.json(
        { error: resultat.message },
        { status: STATUTS_REFUS_CYCLE_VIE_IMAGE_PRODUIT[resultat.code] }
      )
    }

    return Response.json({ released: true, draftId: resultat.draftId })
  } catch {
    return Response.json(
      { error: "Échec de la libération du Brouillon d'Image produit" },
      { status: 500 }
    )
  }
}
