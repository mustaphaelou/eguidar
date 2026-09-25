import { z } from "zod"

import { deleteR2Object } from "@/lib/r2"
import { estAdmin, lireSession } from "@/lib/use-cases/session-courante"

const deleteSchema = z.object({
  url: z.string().min(1),
})

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

  const parsed = deleteSchema.safeParse(body)
  if (!parsed.success)
    return Response.json({ error: "Requête invalide" }, { status: 400 })

  let resultat: Awaited<ReturnType<typeof deleteR2Object>>
  try {
    resultat = await deleteR2Object(parsed.data.url)
  } catch {
    return Response.json(
      { error: "Échec de la suppression de l'image" },
      { status: 500 }
    )
  }
  if (!resultat.ok) {
    const status =
      resultat.erreur.code === "non-configure"
        ? 503
        : resultat.erreur.code === "parametre-invalide"
          ? 400
          : 500
    return Response.json({ error: resultat.erreur.message }, { status })
  }
  return Response.json({ deleted: true })
}
