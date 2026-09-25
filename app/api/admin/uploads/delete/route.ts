import { z } from "zod"

import cycleVieImageProduit, {
  type CodeRefusCycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const relacherSchema = z
  .object({
    draftId: z.string().min(1),
  })
  .strict()

const STATUTS_REFUS: Record<CodeRefusCycleVieImageProduit, number> = {
  "identifiant-proprietaire-invalide": 400,
  "metadata-invalide": 400,
  "mime-non-autorise": 400,
  "taille-invalide": 400,
  "trop-volumineux": 400,
  "stockage-indisponible": 503,
  "stockage-refuse": 502,
  "registre-indisponible": 500,
  "brouillon-introuvable": 404,
  "proprietaire-incorrect": 403,
  "brouillon-non-vivant": 409,
  "brouillon-expire": 410,
  "revendication-refusee": 409,
  "catalogue-refuse": 409,
}

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
        { status: STATUTS_REFUS[resultat.code] }
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
