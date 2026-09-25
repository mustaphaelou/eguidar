import { z } from "zod"

import cycleVieImageProduit, {
  type CodeRefusCycleVieImageProduit,
} from "@/lib/cycle-vie-image-produit"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const presignSchema = z.object({
  contentType: z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/avif",
    "image/gif",
  ]),
  size: z.number().int().positive(),
})

function statusPourRefus(code: CodeRefusCycleVieImageProduit): number {
  switch (code) {
    case "identifiant-proprietaire-invalide":
    case "metadata-invalide":
    case "mime-non-autorise":
    case "taille-invalide":
    case "trop-volumineux":
      return 400
    case "stockage-indisponible":
      return 503
    case "stockage-refuse":
      return 502
    case "registre-indisponible":
      return 500
    default:
      return 500
  }
}

export async function POST(request: Request) {
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

  const parsed = presignSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: "Requête invalide" }, { status: 400 })

  try {
    const resultat = await cycleVieImageProduit.demanderBrouillon({
      ownerId: client.id,
      contentType: parsed.data.contentType,
      size: parsed.data.size,
    })
    if (!resultat.ok) {
      return Response.json(
        { error: resultat.message },
        { status: statusPourRefus(resultat.code) }
      )
    }

    return Response.json({
      draftId: resultat.draftId,
      uploadUrl: resultat.uploadUrl,
      previewUrl: resultat.previewUrl,
      expiresAt: resultat.expiresAt,
    })
  } catch {
    return Response.json(
      { error: "Échec de la préparation du téléversement" },
      { status: 500 }
    )
  }
}
